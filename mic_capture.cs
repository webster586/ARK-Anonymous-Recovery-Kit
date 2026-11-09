using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;

// Windows Multimedia waveIn: PCM mono 16kHz. No external audio tools, no cloud.
// Buffered, non-looping capture, up to 60 seconds per press. Strict local lifetime.
public sealed class ArkMicCapture : IDisposable {
    [StructLayout(LayoutKind.Sequential, Pack=2)]
    struct WaveFormat {
        public ushort wFormatTag, nChannels;
        public uint nSamplesPerSec, nAvgBytesPerSec;
        public ushort nBlockAlign, wBitsPerSample, cbSize;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct WaveHeader {
        public IntPtr lpData;
        public uint dwBufferLength, dwBytesRecorded;
        public IntPtr dwUser;
        public uint dwFlags, dwLoops;
        public IntPtr lpNext, reserved;
    }
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInOpen(out IntPtr hWaveIn, uint deviceID, ref WaveFormat format, IntPtr callback, IntPtr instance, uint flags);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInPrepareHeader(IntPtr hWaveIn, IntPtr header, uint size);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInAddBuffer(IntPtr hWaveIn, IntPtr header, uint size);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInUnprepareHeader(IntPtr hWaveIn, IntPtr header, uint size);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInStart(IntPtr hWaveIn);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInStop(IntPtr hWaveIn);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInReset(IntPtr hWaveIn);
    [DllImport("winmm.dll", ExactSpelling=true)]
    static extern uint waveInClose(IntPtr hWaveIn);

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct WaveInCaps {
        public ushort wMid, wPid;
        public uint vDriverVersion;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)]
        public string szPname;
        public uint dwFormats;
        public ushort wChannels, wReserved1;
    }
    [DllImport("winmm.dll", EntryPoint="waveInGetNumDevs", ExactSpelling=true)]
    static extern uint waveInGetNumDevs();
    [DllImport("winmm.dll", EntryPoint="waveInGetDevCapsW", ExactSpelling=true, CharSet=CharSet.Unicode)]
    static extern uint waveInGetDevCapsW(UIntPtr deviceId, out WaveInCaps caps, uint size);
    public sealed class InputDevice {
        public int id {get;set;}
        public string name {get;set;}
    }
    public static InputDevice[] ListDevices() {
        var found = new List<InputDevice>();
        uint count = waveInGetNumDevs();
        for(uint i=0;i<count;i++){
            WaveInCaps caps;
            if(waveInGetDevCapsW(new UIntPtr(i),out caps,(uint)Marshal.SizeOf(typeof(WaveInCaps))) == 0)
                found.Add(new InputDevice{id=(int)i,name=(caps.szPname??"").TrimEnd('\0')});
        }
        return found.ToArray();
    }
    const int Rate=16000, ChunkBytes=16000, MaxChunks=120; // 0.5sec each, 60sec max
    readonly List<IntPtr> headers=new List<IntPtr>();
    readonly List<IntPtr> blocks=new List<IntPtr>();
    IntPtr h=IntPtr.Zero;
    readonly uint headSize=(uint)Marshal.SizeOf(typeof(WaveHeader));
    bool active;
    static void Check(uint code,string fn) {
        if(code!=0)throw new InvalidOperationException(fn+" failed (winmm code "+code+"). Check Windows microphone permissions and selected default recording device.");
    }
    public void Start(int deviceId = -1) {
        if(active)return;
        WaveFormat fmt=new WaveFormat {wFormatTag=1,nChannels=1,nSamplesPerSec=Rate,nAvgBytesPerSec=Rate*2,nBlockAlign=2,wBitsPerSample=16,cbSize=0};
        try {
            Check(waveInOpen(out h, deviceId < 0 ? 0xffffffff : (uint)deviceId, ref fmt,IntPtr.Zero,IntPtr.Zero,0),"waveInOpen");
            for(int i=0;i<MaxChunks;i++) {
                IntPtr block=Marshal.AllocHGlobal(ChunkBytes);
                blocks.Add(block);
                WaveHeader hdr = new WaveHeader {lpData=block,dwBufferLength=ChunkBytes};
                IntPtr ptr=Marshal.AllocHGlobal((int)headSize);
                headers.Add(ptr);
                Marshal.StructureToPtr(hdr,ptr,false);
                Check(waveInPrepareHeader(h,ptr,headSize),"waveInPrepareHeader");
                Check(waveInAddBuffer(h,ptr,headSize),"waveInAddBuffer");
            }
            Check(waveInStart(h),"waveInStart");
            active=true;
        } catch {Dispose();throw;}
    }
    public void StopSave(string path) {
        if(!active)throw new InvalidOperationException("Mic recording not active");
        try {
            Check(waveInStop(h),"waveInStop");
            Check(waveInReset(h),"waveInReset");
            // All buffers returned by Reset; read only data the driver actually filled.
            using(var pcm=new MemoryStream()) {
                foreach(IntPtr ptr in headers) {
                    WaveHeader hdr=(WaveHeader)Marshal.PtrToStructure(ptr,typeof(WaveHeader));
                    int n=(int)Math.Min(hdr.dwBytesRecorded,hdr.dwBufferLength);
                    if(n>0) {
                        byte[] bytes=new byte[n];
                        Marshal.Copy(hdr.lpData,bytes,0,n);
                        pcm.Write(bytes,0,n);
                    }
                }
                byte[] audio=pcm.ToArray();
                if(audio.Length<6400)throw new InvalidOperationException("Aufnahme zu kurz (mindestens ca. 0,2 Sekunden sprechen).");
                using(FileStream file=new FileStream(path,FileMode.Create,FileAccess.Write))
                using(BinaryWriter w=new BinaryWriter(file)) {
                    w.Write(new char[]{'R','I','F','F'});w.Write((uint)(36+audio.Length));
                    w.Write(new char[]{'W','A','V','E'});
                    w.Write(new char[]{'f','m','t',' '});w.Write((uint)16);w.Write((ushort)1);w.Write((ushort)1);
                    w.Write((uint)Rate);w.Write((uint)(Rate*2));w.Write((ushort)2);w.Write((ushort)16);
                    w.Write(new char[]{'d','a','t','a'});w.Write((uint)audio.Length);w.Write(audio);
                }
            }
        } finally {Dispose();}
    }
    public void Dispose() {
        if(h!=IntPtr.Zero) {
            waveInStop(h);waveInReset(h);
            foreach(IntPtr ptr in headers) {if(ptr!=IntPtr.Zero)waveInUnprepareHeader(h,ptr,headSize);}
            waveInClose(h);h=IntPtr.Zero;
        }
        foreach(IntPtr ptr in headers) {if(ptr!=IntPtr.Zero)Marshal.FreeHGlobal(ptr);}headers.Clear();
        foreach(IntPtr ptr in blocks) {if(ptr!=IntPtr.Zero)Marshal.FreeHGlobal(ptr);}blocks.Clear();
        active=false;
    }
}
