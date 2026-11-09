//go:build windows

// ARK Native Controller – stand-alone Windows x64 server and direct HID driver.
// V0.3: optional Whisper.cpp speech recognition; unchanged tested HID and exit logic.
// Only documents/tested-protocol family: Stream Deck 2019, MK.2, 15-Key Module.
// Device side remains test-required; no admin privilege or installer required for normal HID access.
package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

//go:embed ui/index.html ui/assets/* ui/nrw3d/* ui/atlas/* ui/visualizer/* ui/css/* ui/js/*
var frontend embed.FS

const preferredPort = 8765
const vendorElgato = 0x0fd9
const nkeys = 15

// appVersion is the unchanged semantic version. buildID is injected at release-build
// time via -ldflags "-X main.buildID=YYYYMMDD-HHMM" and stays "dev" for ad-hoc/test builds,
// so it is never regenerated on ordinary `go build`/program start.
const appVersion = "1.4.5.3"

var buildID = "dev"

func fullVersion() string {
	if buildID == "" || buildID == "dev" {
		return appVersion
	}
	return appVersion + "+" + buildID
}

// Four Roman top-row shortcuts open ARK-01..ARK-04; TEXT is at bottom row column four.
var nav = [15]string{"ark1", "ark2", "up", "ark3", "ark4", "linkprev", "left", "ok", "right", "linknext", "back", "voice", "down", "keyboard", "forward"}

// Physical 5x3 layout, telephone-style digit clusters in columns 2–4.
var t9Layout = [15]string{"kbdSpace", "kbd1", "kbd2", "kbd3", "kbdErase", "kbdCase", "kbd4", "kbd5", "kbd6", "kbdSearch", "kbdExit", "kbd7", "kbd8", "kbd9", "kbd0"}
var textDefault = map[string]string{"up": "HOCH", "down": "RUNTER", "left": "LINKS", "right": "RECHTS", "ok": "OK", "back": "ZURUECK", "forward": "VOR", "voice": "PTT", "linkprev": "VOR LINK", "linknext": "NAECH LINK", "keyboard": "TEXT", "ark1": "I", "ark2": "II", "ark3": "III", "ark4": "IV"}

type config struct {
	Brightness int `json:"brightness"`
	Keys       map[string]struct {
		Label string `json:"label"`
		Image string `json:"image"`
	} `json:"keys"`
}

func loadConfig() config {
	c := config{Brightness: 35, Keys: make(map[string]struct {
		Label string `json:"label"`
		Image string `json:"image"`
	})}
	b, e := os.ReadFile("config.json")
	if e == nil {
		if e = json.Unmarshal(b, &c); e != nil {
			log.Println("Konfiguration:", e)
		}
	}
	if c.Brightness < 1 || c.Brightness > 100 {
		c.Brightness = 35
	}
	if c.Keys == nil {
		c.Keys = make(map[string]struct {
			Label string `json:"label"`
			Image string `json:"image"`
		})
	}
	return c
}

type event struct {
	Seq      uint64 `json:"seq"`
	Key      int    `json:"key"`
	Command  string `json:"command"`
	TextMode bool   `json:"text_mode"`
}
type service struct {
	mu            sync.Mutex
	events        []event
	seq           uint64
	connected     bool
	recognized    string
	state         string
	handle        syscall.Handle
	cfg           config
	context       context.Context
	cancel        context.CancelFunc
	voice         *Voice
	keyboard      bool
	deviceWriteMu sync.Mutex
}

// Each physical key event carries its original command and mode. Never decode
// a queued key with the mode that happens to be active when the browser polls.
func (s *service) pushKey(key int, command string, wasTextMode bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.seq++
	s.events = append(s.events, event{Seq: s.seq, Key: key, Command: command, TextMode: wasTextMode})
	if len(s.events) > 250 {
		s.events = s.events[len(s.events)-250:]
	}
}
func (s *service) status(msg string, conn bool, rec string) {
	s.mu.Lock()
	s.state = msg
	s.connected = conn
	s.recognized = rec
	s.mu.Unlock()
	log.Println(msg)
}
func (s *service) snapshot(after uint64) any {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []event{}
	for _, e := range s.events {
		if e.Seq > after {
			out = append(out, e)
		}
	}
	return map[string]any{"deck": s.connected, "support": true, "info": s.state, "device": s.recognized, "events": out, "keyboard": s.keyboard}
}

var setupapi = syscall.NewLazyDLL("setupapi.dll")
var hid = syscall.NewLazyDLL("hid.dll")
var kernel = syscall.NewLazyDLL("kernel32.dll")
var pHidGuid = hid.NewProc("HidD_GetHidGuid")
var pHidAttr = hid.NewProc("HidD_GetAttributes")
var pHidSetFeature = hid.NewProc("HidD_SetFeature")
var pSetupDevs = setupapi.NewProc("SetupDiGetClassDevsW")
var pEnum = setupapi.NewProc("SetupDiEnumDeviceInterfaces")
var pDetail = setupapi.NewProc("SetupDiGetDeviceInterfaceDetailW")
var pDestroy = setupapi.NewProc("SetupDiDestroyDeviceInfoList")
var pCancel = kernel.NewProc("CancelIoEx")
var pGetPreparsed = hid.NewProc("HidD_GetPreparsedData")
var pFreePreparsed = hid.NewProc("HidD_FreePreparsedData")
var pGetCaps = hid.NewProc("HidP_GetCaps")

// Win32 HID report read/write buffer sizes must match this device's HID descriptor.
func reportLengths(h syscall.Handle) (input uint16, output uint16, err error) {
	var ptr uintptr
	ok, _, e := pGetPreparsed.Call(uintptr(h), uintptr(unsafe.Pointer(&ptr)))
	if ok == 0 {
		return 0, 0, fmt.Errorf("HidD_GetPreparsedData: %v", e)
	}
	defer pFreePreparsed.Call(ptr)
	buf := [128]byte{}
	status, _, _ := pGetCaps.Call(ptr, uintptr(unsafe.Pointer(&buf[0])))
	if status != 0x00110000 {
		return 0, 0, fmt.Errorf("HidP_GetCaps status 0x%x", status)
	}
	return binary.LittleEndian.Uint16(buf[4:6]), binary.LittleEndian.Uint16(buf[6:8]), nil
}

type devInterface struct {
	Size     uint32
	Guid     syscall.GUID
	Flags    uint32
	Reserved uintptr
}
type hidAttr struct {
	Size    uint32
	VID     uint16
	PID     uint16
	Version uint16
	_       uint16
}
type device struct {
	Path string
	VID  uint16
	PID  uint16
	Name string
}

func model(pid uint16) (string, bool) {
	switch pid {
	case 0x006d:
		return "Stream Deck 2019 (20GAA9902)", true
	case 0x0080:
		return "Stream Deck MK.2", true
	case 0x00b9:
		return "Stream Deck 15-Key Module", true
	case 0x00a5:
		return "Stream Deck MK.2 Scissor", true
	case 0x0060:
		return "Stream Deck 2017 – anderes Protokoll", false
	case 0x0063:
		return "Stream Deck Mini – anderes Protokoll", false
	case 0x006c:
		return "Stream Deck XL – anderes Layout", false
	default:
		return fmt.Sprintf("Stream Deck PID %04X – noch nicht freigegeben", pid), false
	}
}

func enumerate() ([]device, error) {
	var guid syscall.GUID
	pHidGuid.Call(uintptr(unsafe.Pointer(&guid)))
	info, _, e := pSetupDevs.Call(uintptr(unsafe.Pointer(&guid)), 0, 0, 0x12) // PRESENT | DEVICEINTERFACE
	if info == 0 || info == ^uintptr(0) {
		return nil, fmt.Errorf("SetupDiGetClassDevs: %v", e)
	}
	defer pDestroy.Call(info)
	results := []device{}
	for i := uint32(0); i < 512; i++ {
		d := devInterface{Size: uint32(unsafe.Sizeof(devInterface{}))}
		r, _, _ := pEnum.Call(info, 0, uintptr(unsafe.Pointer(&guid)), uintptr(i), uintptr(unsafe.Pointer(&d)))
		if r == 0 {
			break
		}
		var needed uint32
		pDetail.Call(info, uintptr(unsafe.Pointer(&d)), 0, 0, uintptr(unsafe.Pointer(&needed)), 0)
		if needed < 8 || needed > 65536 {
			continue
		}
		buf := make([]byte, needed)
		binary.LittleEndian.PutUint32(buf[:4], 8) // Windows x64 SP_DEVICE_INTERFACE_DETAIL_DATA_W cbSize
		r, _, _ = pDetail.Call(info, uintptr(unsafe.Pointer(&d)), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)), uintptr(unsafe.Pointer(&needed)), 0)
		if r == 0 {
			continue
		}
		pathUnits := []uint16{}
		for o := 4; o+1 < len(buf); o += 2 {
			v := binary.LittleEndian.Uint16(buf[o : o+2])
			if v == 0 {
				break
			}
			pathUnits = append(pathUnits, v)
		}
		path := syscall.UTF16ToString(append(pathUnits, 0))
		if path == "" {
			continue
		}
		h, err := syscall.CreateFile(syscall.StringToUTF16Ptr(path), 0, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil, syscall.OPEN_EXISTING, 0, 0)
		if err != nil {
			continue
		}
		a := hidAttr{Size: uint32(unsafe.Sizeof(hidAttr{}))}
		ok, _, _ := pHidAttr.Call(uintptr(h), uintptr(unsafe.Pointer(&a)))
		syscall.CloseHandle(h)
		if ok == 0 || a.VID != vendorElgato {
			continue
		}
		name, _ := model(a.PID)
		results = append(results, device{Path: path, VID: a.VID, PID: a.PID, Name: name})
	}
	return results, nil
}

func feature(h syscall.Handle, cmd byte, value byte) error {
	buf := [32]byte{0x03, cmd, value}
	ok, _, e := pHidSetFeature.Call(uintptr(h), uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if ok == 0 {
		return fmt.Errorf("HID Feature 0x%02x: %v", cmd, e)
	}
	return nil
}

// Keep the output report exactly 1024 bytes per official Classic HID specification.
func imageUpload(h syscall.Handle, key int, jpg []byte) error {
	const payload = 1016
	for chunk, off := 0, 0; off < len(jpg); chunk, off = chunk+1, off+payload {
		size := len(jpg) - off
		if size > payload {
			size = payload
		}
		b := make([]byte, 1024)
		b[0] = 0x02
		b[1] = 0x07
		b[2] = byte(key)
		if off+size == len(jpg) {
			b[3] = 0x01
		}
		binary.LittleEndian.PutUint16(b[4:6], uint16(size))
		binary.LittleEndian.PutUint16(b[6:8], uint16(chunk))
		copy(b[8:], jpg[off:off+size])
		var written uint32
		if e := syscall.WriteFile(h, b, &written, nil); e != nil {
			return fmt.Errorf("Bildtaste %d, Paket %d: %w", key, chunk, e)
		}
		if written != 1024 {
			return fmt.Errorf("HID hat %d/1024 Byte geschrieben", written)
		}
	}
	return nil
}

var mint = color.RGBA{122, 238, 191, 255}
var amber = color.RGBA{242, 184, 103, 255}
var pale = color.RGBA{237, 249, 244, 255}
var dark = color.RGBA{10, 21, 24, 255}

func pset(im *image.RGBA, x, y int, c color.RGBA) {
	if x >= 0 && x < 72 && y >= 0 && y < 72 {
		im.SetRGBA(x, y, c)
	}
}
func line(im *image.RGBA, x0, y0, x1, y1 int, c color.RGBA) {
	dx := abs(x1 - x0)
	sx := -1
	if x0 < x1 {
		sx = 1
	}
	dy := -abs(y1 - y0)
	sy := -1
	if y0 < y1 {
		sy = 1
	}
	err := dx + dy
	for {
		for a := -1; a <= 1; a++ {
			pset(im, x0+a, y0, c)
			pset(im, x0, y0+a, c)
		}
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 >= dy {
			err += dy
			x0 += sx
		}
		if e2 <= dx {
			err += dx
			y0 += sy
		}
	}
}
func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
func circle(im *image.RGBA, cx, cy, r int, c color.RGBA) {
	x, y, e := r, 0, 1-r
	for x >= y {
		for _, p := range [][2]int{{cx + x, cy + y}, {cx + y, cy + x}, {cx - y, cy + x}, {cx - x, cy + y}, {cx - x, cy - y}, {cx - y, cy - x}, {cx + y, cy - x}, {cx + x, cy - y}} {
			pset(im, p[0], p[1], c)
		}
		y++
		if e < 0 {
			e += 2*y + 1
		} else {
			x--
			e += 2*(y-x) + 1
		}
	}
}
func drawSymbol(im *image.RGBA, cmd string, c color.RGBA) {
	switch cmd {
	case "keyboard":
		// Keyboard grid, useful visual cue on the otherwise free top-left key.
		for _, y := range []int{14, 40} {
			line(im, 14, y, 57, y, c)
		}
		for _, x := range []int{14, 57} {
			line(im, x, 14, x, 40, c)
		}
		for _, y := range []int{22, 31} {
			line(im, 17, y, 54, y, c)
		}
		for _, x := range []int{26, 39} {
			line(im, x, 17, x, 36, c)
		}
	case "up":
		line(im, 36, 12, 36, 42, c)
		line(im, 36, 12, 22, 27, c)
		line(im, 36, 12, 50, 27, c)
	case "down":
		line(im, 36, 13, 36, 42, c)
		line(im, 36, 42, 22, 27, c)
		line(im, 36, 42, 50, 27, c)
	case "left":
		line(im, 48, 27, 23, 27, c)
		line(im, 23, 27, 38, 13, c)
		line(im, 23, 27, 38, 41, c)
	case "right":
		line(im, 24, 27, 49, 27, c)
		line(im, 49, 27, 34, 13, c)
		line(im, 49, 27, 34, 41, c)
	case "linkprev":
		// Short list and distinct left-facing selection arrow (not browser back).
		line(im, 29, 16, 53, 16, c)
		line(im, 29, 26, 53, 26, c)
		line(im, 29, 36, 53, 36, c)
		line(im, 19, 26, 28, 17, c)
		line(im, 19, 26, 28, 35, c)
	case "linknext":
		line(im, 19, 16, 43, 16, c)
		line(im, 19, 26, 43, 26, c)
		line(im, 19, 36, 43, 36, c)
		line(im, 53, 26, 44, 17, c)
		line(im, 53, 26, 44, 35, c)
	case "ok":
		circle(im, 36, 27, 19, c)
		line(im, 25, 27, 33, 35, c)
		line(im, 33, 35, 48, 19, c)
	case "back":
		line(im, 48, 21, 24, 21, c)
		line(im, 24, 21, 34, 12, c)
		line(im, 24, 21, 34, 31, c)
		line(im, 48, 21, 48, 37, c)
		line(im, 48, 37, 37, 37, c)
	case "forward":
		line(im, 24, 21, 48, 21, c)
		line(im, 48, 21, 38, 12, c)
		line(im, 48, 21, 38, 31, c)
		line(im, 24, 21, 24, 37, c)
		line(im, 24, 37, 35, 37, c)
	case "voice":
		// Microphone capsule + stand + foot, centered in the 72x72 OLED key.
		for y := 14; y < 34; y++ {
			for x := 31; x < 42; x++ {
				pset(im, x, y, c)
			}
		}
		line(im, 25, 26, 25, 33, c)
		line(im, 48, 26, 48, 33, c)
		line(im, 25, 33, 30, 39, c)
		line(im, 30, 39, 42, 39, c)
		line(im, 42, 39, 48, 33, c)
		line(im, 36, 40, 36, 45, c)
		line(im, 28, 46, 44, 46, c)
	}
}

var font = map[rune][7]string{
	'A': {"01110", "10001", "10001", "11111", "10001", "10001", "10001"},
	'B': {"11110", "10001", "10001", "11110", "10001", "10001", "11110"},
	'C': {"01111", "10000", "10000", "10000", "10000", "10000", "01111"},
	'D': {"11110", "10001", "10001", "10001", "10001", "10001", "11110"},
	'E': {"11111", "10000", "10000", "11110", "10000", "10000", "11111"},
	'F': {"11111", "10000", "10000", "11110", "10000", "10000", "10000"},
	'G': {"01111", "10000", "10000", "10111", "10001", "10001", "01111"},
	'H': {"10001", "10001", "10001", "11111", "10001", "10001", "10001"},
	'I': {"11111", "00100", "00100", "00100", "00100", "00100", "11111"},
	'J': {"00111", "00010", "00010", "00010", "10010", "10010", "01100"},
	'K': {"10001", "10010", "10100", "11000", "10100", "10010", "10001"},
	'L': {"10000", "10000", "10000", "10000", "10000", "10000", "11111"},
	'M': {"10001", "11011", "10101", "10101", "10001", "10001", "10001"},
	'N': {"10001", "11001", "10101", "10011", "10001", "10001", "10001"},
	'O': {"01110", "10001", "10001", "10001", "10001", "10001", "01110"},
	'P': {"11110", "10001", "10001", "11110", "10000", "10000", "10000"},
	'Q': {"01110", "10001", "10001", "10001", "10101", "10010", "01101"},
	'R': {"11110", "10001", "10001", "11110", "10100", "10010", "10001"},
	'S': {"01111", "10000", "10000", "01110", "00001", "00001", "11110"},
	'T': {"11111", "00100", "00100", "00100", "00100", "00100", "00100"},
	'U': {"10001", "10001", "10001", "10001", "10001", "10001", "01110"},
	'V': {"10001", "10001", "10001", "10001", "10001", "01010", "00100"},
	'W': {"10001", "10001", "10001", "10101", "10101", "11011", "10001"},
	'X': {"10001", "10001", "01010", "00100", "01010", "10001", "10001"},
	'Y': {"10001", "10001", "01010", "00100", "00100", "00100", "00100"},
	'Z': {"11111", "00001", "00010", "00100", "01000", "10000", "11111"},
	'0': {"01110", "10011", "10101", "10101", "11001", "10001", "01110"},
	'1': {"00100", "01100", "00100", "00100", "00100", "00100", "01110"},
	'2': {"01110", "10001", "00001", "00110", "01000", "10000", "11111"},
	'3': {"11110", "00001", "00001", "01110", "00001", "00001", "11110"},
	'4': {"00010", "00110", "01010", "10010", "11111", "00010", "00010"},
	'5': {"11111", "10000", "11110", "00001", "00001", "10001", "01110"},
	'6': {"01110", "10000", "10000", "11110", "10001", "10001", "01110"},
	'7': {"11111", "00001", "00010", "00100", "01000", "01000", "01000"},
	'8': {"01110", "10001", "10001", "01110", "10001", "10001", "01110"},
	'9': {"01110", "10001", "10001", "01111", "00001", "00001", "01110"},
	' ': {"00000", "00000", "00000", "00000", "00000", "00000", "00000"},
	'-': {"00000", "00000", "00000", "11111", "00000", "00000", "00000"},
}

// printTextFit draws ARK's built-in 5x7 glyphs as large as possible within
// a caller-provided rectangle. Key art is generated locally (72x72 pixels).
// No device protocol or keyboard action is changed by this renderer.
func printTextFit(im *image.RGBA, txt string, x0, y0, width, height, maxX, maxY int, col color.RGBA) {
	txt = strings.ToUpper(txt)
	txt = strings.NewReplacer("Ä", "AE", "Ö", "OE", "Ü", "UE", "ß", "SS").Replace(txt)
	r := []rune(txt)
	if len(r) == 0 || width < 1 || height < 1 {
		return
	}
	// Fit to both dimensions without clipping on the Stream Deck display.
	sx, sy := width/(len(r)*6-1), height/7
	if sx > maxX {
		sx = maxX
	}
	if sy > maxY {
		sy = maxY
	}
	if sx < 1 || sy < 1 {
		return
	}
	tw, th := (len(r)*6-1)*sx, 7*sy
	x, y := x0+(width-tw)/2, y0+(height-th)/2
	for i, ch := range r {
		glyph, ok := font[ch]
		if !ok {
			glyph = font[' ']
		}
		for gy, row := range glyph {
			for gx, v := range row {
				if v != '1' {
					continue
				}
				for yy := 0; yy < sy; yy++ {
					for xx := 0; xx < sx; xx++ {
						pset(im, x+(i*6+gx)*sx+xx, y+gy*sy+yy, col)
					}
				}
			}
		}
	}
}

func drawBigCommand(im *image.RGBA, cmd string, col color.RGBA) {
	switch cmd {
	// Short splits let letter labels use most of the 72x72 LCD without
	// becoming vertically stretched, which was a problem in V1.3.
	case "kbdExit":
		printTextFit(im, "ZUR", 2, 4, 68, 29, 4, 4, col)
		printTextFit(im, "UECK", 2, 39, 68, 29, 3, 4, col)
	case "kbdCase":
		printTextFit(im, "GR", 2, 4, 68, 29, 5, 4, col)
		printTextFit(im, "OSS", 2, 39, 68, 29, 4, 4, col)
	case "kbdSearch":
		printTextFit(im, "SU", 2, 4, 68, 29, 5, 4, col)
		printTextFit(im, "CHE", 2, 39, 68, 29, 4, 4, col)
	case "kbdSpace":
		printTextFit(im, "LE", 2, 4, 68, 29, 5, 4, col)
		printTextFit(im, "ER", 2, 39, 68, 29, 5, 4, col)
	case "kbdErase":
		printTextFit(im, "DEL", 2, 8, 68, 56, 4, 6, col)
	case "kbd0":
		printTextFit(im, "0", 4, 2, 64, 68, 10, 9, col)
	}
}
func iconFile(cfg config, cmd string) string { ent := cfg.Keys[cmd]; return ent.Image }
func makeJPG(cmd string, c config) ([]byte, error) {
	im := image.NewRGBA(image.Rect(0, 0, 72, 72))
	draw.Draw(im, im.Bounds(), &image.Uniform{dark}, image.Point{}, draw.Src)
	custom := iconFile(c, cmd)
	if custom != "" {
		// Restrict custom images to relative paths inside "icons".
		clean := filepath.Clean(custom)
		if filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") || strings.Contains(clean, ":") {
			return nil, fmt.Errorf("unsicherer Icon-Pfad %q", custom)
		}
		path := filepath.Join("icons", clean)
		file, e := os.Open(path)
		if e != nil {
			return nil, fmt.Errorf("Icon %s: %w", path, e)
		}
		src, format, e := image.Decode(file)
		file.Close()
		if e != nil {
			return nil, e
		}
		if format != "png" && format != "jpeg" {
			return nil, errors.New("nur PNG/JPEG unterstützt")
		}
		bounds := src.Bounds()
		for y := 0; y < 72; y++ {
			for x := 0; x < 72; x++ {
				ix := bounds.Min.X + x*bounds.Dx()/72
				iy := bounds.Min.Y + y*bounds.Dy()/72
				im.Set(x, y, src.At(ix, iy))
			}
		}
	} else if strings.HasPrefix(cmd, "ark") && len(cmd) == 4 && cmd[3] >= '1' && cmd[3] <= '4' {
		// Four large Roman numerals, nearly full key width; target line below.
		numerals := []string{"I", "II", "III", "IV"}
		num := int(cmd[3] - '1')
		printTextFit(im, numerals[num], 2, 4, 68, 44, 8, 6, mint)
		printTextFit(im, "ARK-0"+string(cmd[3]), 2, 52, 68, 15, 2, 2, pale)
	} else if strings.HasPrefix(cmd, "kbd") {
		labels := map[string][2]string{
			"kbd1": {"1", "PUNKT"}, "kbd2": {"2", "ABC"},
			"kbd3": {"3", "DEF"}, "kbd4": {"4", "GHI"},
			"kbd5": {"5", "JKL"}, "kbd6": {"6", "MNO"},
			"kbd7": {"7", "PQRS"}, "kbd8": {"8", "TUV"},
			"kbd9": {"9", "WXYZ"},
		}
		col := mint
		if cmd == "kbdExit" || cmd == "kbdSearch" {
			col = amber
		}
		if parts, ok := labels[cmd]; ok {
			// Large digit in the upper 42 pixels; letter group across
			// nearly the entire width at the bottom.
			printTextFit(im, parts[0], 2, 1, 68, 42, 6, 6, col)
			printTextFit(im, parts[1], 2, 45, 68, 24, 3, 3, pale)
		} else {
			drawBigCommand(im, cmd, col)
		}
	} else if cmd != "" {
		col := mint
		if cmd == "ok" || cmd == "voice" {
			col = amber
		}
		drawSymbol(im, cmd, col)
		txt := textDefault[cmd]
		if label := strings.TrimSpace(c.Keys[cmd].Label); label != "" {
			txt = label
		}
		printTextFit(im, txt, 2, 47, 68, 23, 3, 3, pale)
	}
	// Official 2019 / MK.2 Classic family requires 180 degree rotation.
	rotated := image.NewRGBA(image.Rect(0, 0, 72, 72))
	for y := 0; y < 72; y++ {
		for x := 0; x < 72; x++ {
			rotated.Set(71-x, 71-y, im.At(x, y))
		}
	}
	var b bytes.Buffer
	err := jpeg.Encode(&b, rotated, &jpeg.Options{Quality: 90})
	return b.Bytes(), err
}

// setKeyboardMode synchronizes the hardware images and the browser input mode.
// No third-party Stream Deck software, no external network and no global key hooks.
func (s *service) setKeyboardMode(active bool) error {
	// Serialize layout changes from the browser and the physical device.
	s.deviceWriteMu.Lock()
	defer s.deviceWriteMu.Unlock()
	s.mu.Lock()
	if s.keyboard == active {
		s.mu.Unlock()
		return nil
	}
	h := s.handle
	s.mu.Unlock()
	if h != 0 {
		for i := 0; i < 15; i++ {
			cmd := nav[i]
			if active {
				cmd = t9Layout[i]
			}
			jpg, err := makeJPG(cmd, s.cfg)
			if err != nil {
				return fmt.Errorf("Tastenbild %d: %w", i, err)
			}
			if err = imageUpload(h, i, jpg); err != nil {
				return fmt.Errorf("Tastenbild %d übertragen: %w", i, err)
			}
		}
	}
	// Report the new mode only after the hardware images are restored.
	s.mu.Lock()
	s.keyboard = active
	s.mu.Unlock()
	return nil
}
func (s *service) runDevice(d device) error {
	h, e := syscall.CreateFile(syscall.StringToUTF16Ptr(d.Path), syscall.GENERIC_READ|syscall.GENERIC_WRITE, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil, syscall.OPEN_EXISTING, 0, 0)
	if e != nil {
		return fmt.Errorf("USB-HID nicht geöffnet: %w; ggf. Elgato-Software schließen", e)
	}
	s.mu.Lock()
	s.handle = h
	s.mu.Unlock()
	// Always close our HID handle after canceling the blocking read. On a regular
	// ARK shutdown, restore the manufacturer's logo before releasing the device.
	defer func() {
		if s.context.Err() != nil {
			if err := feature(h, 0x02, 0); err != nil {
				log.Printf("Stream Deck Startlogo konnte nicht wiederhergestellt werden: %v", err)
			} else {
				log.Println("Stream Deck Startlogo wiederhergestellt")
			}
		}
		s.deviceWriteMu.Lock()
		_ = syscall.CloseHandle(h)
		s.deviceWriteMu.Unlock()
		s.mu.Lock()
		s.handle = 0
		s.mu.Unlock()
		log.Println("Stream Deck USB-HID freigegeben")
	}()
	inputLen, outputLen, err := reportLengths(h)
	if err != nil {
		return err
	}
	if inputLen < 19 || inputLen > 4096 || outputLen != 1024 {
		return fmt.Errorf("Unerwartete HID-Reportgrößen: IN=%d OUT=%d (benötigt IN>=19, OUT=1024)", inputLen, outputLen)
	}
	log.Printf("HID-Reports: Input %d Byte, Output %d Byte", inputLen, outputLen)
	if err := feature(h, 0x08, byte(s.cfg.Brightness)); err != nil {
		log.Println("Helligkeit:", err)
	}
	s.mu.Lock()
	initialKeyboard := s.keyboard
	s.mu.Unlock()
	s.deviceWriteMu.Lock()
	for i, cmd := range nav {
		if initialKeyboard {
			cmd = t9Layout[i]
		}
		jpg, err := makeJPG(cmd, s.cfg)
		if err != nil {
			s.deviceWriteMu.Unlock()
			return fmt.Errorf("Icon %d: %w", i, err)
		}
		if err = imageUpload(h, i, jpg); err != nil {
			s.deviceWriteMu.Unlock()
			return err
		}
	}
	s.deviceWriteMu.Unlock()
	s.status("USB-HID verbunden: "+d.Name, true, d.Name)
	defer s.status("Stream Deck getrennt; suche nach Gerät ...", false, "")
	defer s.voice.release()
	prev := [15]byte{}
	readbuf := make([]byte, int(inputLen))
	for {
		select {
		case <-s.context.Done():
			return nil
		default:
		}
		var n uint32
		e := syscall.ReadFile(h, readbuf, &n, nil)
		if e != nil {
			return fmt.Errorf("Stream Deck getrennt / Lesefehler: %w", e)
		}
		if n < 19 || readbuf[0] != 0x01 || readbuf[1] != 0x00 {
			continue
		}
		ln := int(binary.LittleEndian.Uint16(readbuf[2:4]))
		if ln < 15 {
			continue
		}
		for i := 0; i < 15; i++ {
			pressed := readbuf[4+i]
			s.mu.Lock()
			kbd := s.keyboard
			s.mu.Unlock()
			if i == 11 && !kbd {
				if pressed == 1 && prev[i] != 1 {
					s.voice.press()
				}
				if pressed != 1 && prev[i] == 1 {
					s.voice.release()
				}
			} else if pressed == 1 && prev[i] != 1 {
				switch {
				case !kbd && i == 13:
					// NAV -> TEXT; the event identifies the old NAV command.
					if err := s.setKeyboardMode(true); err != nil {
						log.Println("T9 starten:", err)
					} else {
						s.pushKey(i, nav[i], false)
					}
				case kbd && (i == 9 || i == 10):
					// SUCHE and ZURUECK BOTH restore the real 15-key NAV layout.
					// Send the original T9 command, even though the mode is already NAV.
					if err := s.setKeyboardMode(false); err != nil {
						log.Println("T9 beenden:", err)
					}
					s.pushKey(i, t9Layout[i], true)
				case kbd:
					s.pushKey(i, t9Layout[i], true)
				case nav[i] != "":
					s.pushKey(i, nav[i], false)
				}
			}
			prev[i] = pressed
		}
	}
}
func (s *service) watch() {
	for {
		select {
		case <-s.context.Done():
			return
		default:
		}
		found, e := enumerate()
		if e != nil {
			s.status("USB-HID Geräteabfrage: "+e.Error(), false, "")
		}
		valid := false
		for _, d := range found {
			_, supported := model(d.PID)
			if supported {
				valid = true
				if e = s.runDevice(d); e != nil {
					s.status(e.Error(), false, d.Name)
				}
				break
			}
		}
		if !valid {
			if len(found) > 0 {
				s.status("Stream Deck erkannt, Modell noch nicht freigeschaltet: "+found[0].Name, false, found[0].Name)
			} else {
				s.status("Kein Stream Deck erkannt – ARK per Tastatur nutzbar", false, "")
			}
		}
		select {
		case <-s.context.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}
func (s *service) stop() {
	s.mu.Lock()
	h := s.handle
	s.mu.Unlock()
	if h != 0 {
		pCancel.Call(uintptr(h), 0)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(v)
}

// Launch a diagnostic scan without changing the Stream Deck's LCD or brightness.
// This verifies the HID interface, report descriptors and write access.
func diagnose() {
	log.Println("ARK USB-DIAGNOSE (ohne Schreiben auf das Gerät)")
	ds, err := enumerate()
	if err != nil {
		log.Printf("Geräteerkennung fehlgeschlagen: %v", err)
		return
	}
	if len(ds) == 0 {
		log.Println("Kein Elgato-HID-Gerät erkannt. USB und Geräte-Manager prüfen.")
		return
	}
	for i, d := range ds {
		_, supported := model(d.PID)
		log.Printf("Gerät %d: %s | VID=%04X PID=%04X | unterstützt=%t", i+1, d.Name, d.VID, d.PID, supported)
		if !supported {
			continue
		}
		h, err := syscall.CreateFile(syscall.StringToUTF16Ptr(d.Path), syscall.GENERIC_READ|syscall.GENERIC_WRITE, syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE, nil, syscall.OPEN_EXISTING, 0, 0)
		if err != nil {
			log.Printf("  HID öffnen: FEHLER: %v. Andere Programme schließen.", err)
			continue
		}
		input, output, err := reportLengths(h)
		syscall.CloseHandle(h)
		if err != nil {
			log.Printf("  HID-Berichtslängen nicht lesbar: %v", err)
		} else {
			log.Printf("  HID zugreifbar: Input=%d Byte, Output=%d Byte", input, output)
		}
	}
	log.Println("Diagnose abgeschlossen. Es wurden keine Tastenbilder übertragen.")
}

// Identify an already running ARK instance before allocating another port.
// This also recognizes the status API of V0.1.
func runningARKVersion(url string) string {
	client := &http.Client{Timeout: 550 * time.Millisecond}
	if resp, err := client.Get(url + "/api/identity"); err == nil {
		var id struct {
			App     string `json:"app"`
			Version string `json:"version"`
		}
		if resp.StatusCode == http.StatusOK {
			_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&id)
		}
		resp.Body.Close()
		if id.App == "ARK Native Controller" && id.Version != "" {
			return id.Version
		}
	}
	// Legacy V0.1 identifies itself only through /api/status.
	resp, err := client.Get(url + "/api/status")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	var status map[string]json.RawMessage
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&status); err != nil {
		return ""
	}
	var support bool
	if err := json.Unmarshal(status["support"], &support); err != nil {
		return ""
	}
	_, okInfo := status["info"]
	_, okEvents := status["events"]
	if support && okInfo && okEvents {
		return "0.1 (alt)"
	}
	return ""
}
func openBrowser(url string) {
	if os.Getenv("ARK_MANAGED_BY_ORIGIN") == "1" {
		return
	}
	cmd := exec.Command("rundll32.exe", "url.dll,FileProtocolHandler", url)
	if err := cmd.Start(); err != nil {
		log.Printf("Browser bitte selbst öffnen: %s (%v)", url, err)
	}
}

// A busy port is not a USB error. Reuse ARK if it is already open;
// otherwise use the next available local port.
func bindLocalServer() (net.Listener, string, bool, error) {
	for port := preferredPort; port <= preferredPort+10; port++ {
		address := "127.0.0.1:" + strconv.Itoa(port)
		l, err := net.Listen("tcp4", address)
		if err == nil {
			return l, address, false, nil
		}
		url := "http://" + address
		if version := runningARKVersion(url); version != "" {
			if version != "0.2.1" {
				return nil, "", false, fmt.Errorf("ARK %s ist auf %s noch aktiv. Bitte die alte ARK-Version beenden und die gewuenschte Version erneut starten", version, url)
			}
			log.Printf("ARK V0.2.1 läuft bereits auf %s – vorhandene Oberfläche wird geöffnet.", url)
			openBrowser(url)
			return nil, address, true, nil
		}
		log.Printf("Port %d ist durch eine andere Anwendung belegt oder gesperrt; prüfe nächsten Port.", port)
	}
	return nil, "", false, fmt.Errorf("kein freier lokaler TCP-Port von %d bis %d", preferredPort, preferredPort+10)
}

// Accept only requests originating from ARK's own local page for state-changing
// endpoints. This prevents a random remote site from dismissing the UI.
func sameOrigin(r *http.Request, address string) bool {
	origin := r.Header.Get("Origin")
	return origin == "http://"+address || origin == "http://localhost:"+strings.TrimPrefix(address, "127.0.0.1:")
}

func main() {
	if exe, err := os.Executable(); err == nil {
		_ = os.Chdir(filepath.Dir(exe))
	}
	log.SetFlags(log.Ltime)
	for _, arg := range os.Args[1:] {
		if arg == "--diagnose" {
			diagnose()
			return
		}
	}
	// Bind BEFORE opening the HID device, so a duplicate process cannot compete
	// with the running ARK instance for USB ownership.
	listener, address, alreadyRunning, err := bindLocalServer()
	if err != nil {
		log.Fatal("Lokaler Server: ", err)
	}
	if alreadyRunning {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	voice := newVoice()
	wiki := newWiki()
	whisperSetup := &scriptInstaller{}
	kiwixSetup := &scriptInstaller{}
	bible := newBible()
	media := newMedia()
	downloader := newDownloader(media)
	apps := newLocalApps(media)
	ollama := newOllamaManager(media)
	nrw := newNRW()
	atlas := newAtlas()
	pmtilesBase := newPMTilesBasemap()
	library := newLibrary(media, wiki)
	go wiki.startFromConfig()
	// Let ARK-0 bindings (kiwix_serve path, wikipedia folder/.zim) apply to
	// the already-running Kiwix service immediately instead of only after a
	// full ARK restart - see installOnBindingChanged in
	// install_dashboard_windows.go for the historical bug this closes.
	installOnBindingChanged = func(id string) {
		switch id {
		case "wikipedia":
			wiki.applyWikipediaBinding()
			library.refresh()
		case "kiwix_serve":
			go wiki.restart()
		}
	}
	pages := newPageTracker()
	quit := make(chan string, 1)
	requestQuit := func(reason string) {
		select {
		case quit <- reason:
		default:
		}
	}
	s := &service{cfg: loadConfig(), context: ctx, cancel: cancel, state: "Suche Stream Deck ...", voice: voice}
	mux := http.NewServeMux()
	installRegister(mux, address)
	registerRazielReadonly(mux)
	registerRazielV2(mux)
	registerRazielV3(mux)
	rzRegisterV4(mux)
	originRegister(mux)
	originPatchRegister(mux)
	switchAPI(mux)
	originSafeUIRegister(mux)
	downloader.register(mux, address)
	micDetector := &micIdentifier{}
	mux.HandleFunc("/api/audio/identify/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		vs := voice.status()
		if vs.State == "recording" || vs.State == "processing" {
			http.Error(w, "Bitte erst die laufende Spracherkennung beenden.", 409)
			return
		}
		if e := micDetector.start(ctx); e != nil {
			http.Error(w, e.Error(), 409)
			return
		}
		writeJSON(w, micDetector.snapshot())
	})
	mux.HandleFunc("/api/audio/identify/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET required", 405)
			return
		}
		writeJSON(w, micDetector.snapshot())
	})
	bible.routes(mux, address)
	media.routes(mux)
	apps.routes(mux)
	ollama.routes(mux)
	registerARKZip(mux, address)
	registerARKArgos(mux, address)
	nrw.routes(mux, address)
	atlas.routes(mux, address)
	pmtilesBase.routes(mux, address)
	library.register(mux, address)
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		after := uint64(0)
		fmt.Sscanf(r.URL.Query().Get("after"), "%d", &after)
		writeJSON(w, s.snapshot(after))
	})
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, s.snapshot(^uint64(0))) })
	mux.HandleFunc("/api/identity", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{"app": "ARK Native Controller", "version": appVersion, "buildId": buildID, "fullVersion": fullVersion()})
	})
	// ARK is a normal browser page, not a background service. The page owns
	// the controller while open, and it releases the device on close/exit.
	mux.HandleFunc("/api/session/ping", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var payload struct {
			ID string `json:"id"`
		}
		if e := json.NewDecoder(io.LimitReader(r.Body, 512)).Decode(&payload); e != nil || !validPageID(payload.ID) {
			http.Error(w, "invalid session", 400)
			return
		}
		pages.ping(payload.ID, time.Now())
		writeJSON(w, map[string]bool{"ok": true})
	})
	mux.HandleFunc("/api/session/bye", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var payload struct {
			ID string `json:"id"`
		}
		if e := json.NewDecoder(io.LimitReader(r.Body, 512)).Decode(&payload); e != nil || !validPageID(payload.ID) {
			http.Error(w, "invalid session", 400)
			return
		}
		pages.close(payload.ID, time.Now())
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/api/shutdown", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		writeJSON(w, map[string]bool{"ok": true})
		requestQuit("ARK wurde in der Oberfläche beendet")
	})
	// Local Wikipedia: only ARK's own loopback Kiwix instance is proxied.
	mux.HandleFunc("/api/wiki/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, wiki.status())
	})
	mux.HandleFunc("/api/wiki/config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var payload struct {
			ZIM string `json:"zim"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 8192)).Decode(&payload); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if err := wiki.setZIM(payload.ZIM); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, wiki.status())
	})
	// Confirm-gated, one-time download of the official kiwix-tools binaries
	// (WIKI_SETUP.ps1 now also pins the archive to a SHA256 hash).
	mux.HandleFunc("/api/kiwix/setup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		root := installRoot()
		err := kiwixSetup.start("Kiwix-Einrichtung läuft …", "Kiwix-Tools installiert. ARK neu starten.", func() error {
			setupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
			defer cancel()
			return runPowerShellScript(setupCtx, root, "WIKI_SETUP.ps1")
		})
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "started": true})
	})
	mux.HandleFunc("/api/kiwix/setup/status", func(w http.ResponseWriter, r *http.Request) {
		busy, msg := kiwixSetup.state()
		writeJSON(w, map[string]any{"busy": busy, "message": msg})
	})
	target, _ := url.Parse("http://127.0.0.1:8791")
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "Lokaler Kiwix-Server momentan nicht bereit", http.StatusBadGateway)
	}
	mux.Handle("/wiki/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !wiki.isReady() {
			http.Error(w, "Wikipedia noch nicht eingerichtet", http.StatusServiceUnavailable)
			return
		}
		proxy.ServeHTTP(w, r)
	}))
	mux.HandleFunc("/api/audio/devices", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET required", 405)
			return
		}
		devices, err := listAudioDevices()
		if err != nil {
			http.Error(w, "Mikrofonliste: "+err.Error(), 500)
			return
		}
		writeJSON(w, map[string]any{"devices": devices, "selected": readAudioConfig()})
	})
	mux.HandleFunc("/api/audio/select", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", 403)
			return
		}
		var requested audioInput
		if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&requested); err != nil {
			http.Error(w, "invalid selection", 400)
			return
		}
		devices, err := listAudioDevices()
		if err != nil {
			http.Error(w, "Mikrofonliste: "+err.Error(), 500)
			return
		}
		if requested.ID == -1 {
			requested.Name = "Windows-Standardmikrofon"
		} else {
			found := false
			for _, d := range devices {
				if requested.ID == d.ID && requested.Name == d.Name {
					found = true
					break
				}
			}
			if !found {
				http.Error(w, "Mikrofon nicht vorhanden oder Name stimmt nicht", 400)
				return
			}
		}
		if err := writeAudioConfig(requested); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "selected": requested})
	})
	mux.HandleFunc("/api/voice/status", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "GET required", 405)
			return
		}
		writeJSON(w, voice.status())
	})
	mux.HandleFunc("/api/voice/press", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "POST required", 405)
			return
		}
		voice.press()
		writeJSON(w, voice.status())
	})
	mux.HandleFunc("/api/voice/release", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "POST required", 405)
			return
		}
		voice.release()
		writeJSON(w, voice.status())
	})
	// Confirm-gated, one-time download of the official whisper.cpp runtime +
	// GGML model (VOICE_SETUP.ps1 already pins both to a SHA256 hash).
	mux.HandleFunc("/api/voice/setup", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || !sameOrigin(r, address) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		var payload struct {
			Model string `json:"model"`
		}
		_ = json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&payload)
		model := "base"
		if payload.Model == "small" {
			model = "small"
		}
		root := installRoot()
		err := whisperSetup.start("Whisper-Einrichtung läuft …", "Whisper-Modell \""+model+"\" ist bereit. ARK neu starten.", func() error {
			setupCtx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
			defer cancel()
			return runPowerShellScript(setupCtx, root, "VOICE_SETUP.ps1", "-Model", model)
		})
		if err != nil {
			writeJSON(w, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, map[string]any{"ok": true, "started": true})
	})
	mux.HandleFunc("/api/voice/setup/status", func(w http.ResponseWriter, r *http.Request) {
		busy, msg := whisperSetup.state()
		writeJSON(w, map[string]any{"busy": busy, "message": msg})
	})
	mux.HandleFunc("/api/keyboard", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", 405)
			return
		}
		var req struct {
			Active bool `json:"active"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 256)).Decode(&req); err != nil {
			http.Error(w, "invalid request", 400)
			return
		}
		if err := s.setKeyboardMode(req.Active); err != nil {
			log.Println("T9:", err)
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "active": req.Active})
	})
	mux.HandleFunc("/api/layout", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "only POST", 405)
			return
		}
		io.Copy(io.Discard, io.LimitReader(r.Body, 8192))
		writeJSON(w, map[string]bool{"ok": true})
	})
	// Windows liefert für ".mjs" (ES-Module, z. B. MapLibre GL) über die
	// Registry oft keinen oder einen falschen MIME-Typ (Fallback "text/plain"),
	// wodurch der Browser den Modulimport wegen "nosniff" strikt verweigert.
	// Hier explizit korrigieren, bevor der FileServer Dateien ausliefert.
	mime.AddExtensionType(".mjs", "text/javascript")
	sub, e := fs.Sub(frontend, "ui")
	if e != nil {
		log.Fatal(e)
	}
	mux.Handle("/", http.FileServer(http.FS(sub)))
	server := &http.Server{Addr: address, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != address && r.Host != "localhost:"+strings.TrimPrefix(address, "127.0.0.1:") {
			http.Error(w, "local only", 403)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})}
	fmt.Println("\n ARK NATIVE CONTROLLER V" + fullVersion() + " EPUB-READER + BOOKS FULLSCREEN + APP ICONS + INPUT FIX + ARGOS + BIBEL-LESEMODUS + OFFLINE-WERKZEUGE + NATURAL EARTH ATLAS + NRW 3D + MIC IDENTIFY + SETTINGS + BIBEL + WIKIPEDIA + VOICE\n Offline nach Argos-Einrichtung | Keine Elgato-Software")
	fmt.Println(" URL: http://" + address)
	fmt.Println(" ARK-Browserfenster schliessen oder ARK BEENDEN klicken.")
	go voice.run()
	deviceDone := make(chan struct{})
	go func() { defer close(deviceDone); s.watch() }()
	// A tab that disappears via a normal close signals "bye" immediately.
	// A crashed or force-killed browser is eventually detected by heartbeat loss.
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				if pages.shouldExit(now) {
					requestQuit("ARK-Browser ist geschlossen")
					return
				}
			}
		}
	}()
	openBrowser("http://" + address)
	stop := make(chan os.Signal, 2)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stop)
	go func() {
		select {
		case reason := <-quit:
			log.Println("Beenden:", reason)
		case sig := <-stop:
			log.Println("Windows-Beenden:", sig)
		}
		cancel()
		s.stop() // CancelIoEx interrupts ReadFile, allowing the HID handle to close.
		wiki.stop()
		voice.stop()
		// Allow time for Show Logo and CloseHandle BEFORE Serve() returns.
		select {
		case <-deviceDone:
		case <-time.After(2800 * time.Millisecond):
			log.Println("Hinweis: USB-Freigabe wartet noch auf Windows")
		}
		c, timeoutCancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer timeoutCancel()
		_ = server.Shutdown(c)
	}()
	e = server.Serve(listener)
	if e != nil && !errors.Is(e, http.ErrServerClosed) {
		log.Println(e)
	}
	cancel()
	s.stop()
	voice.stop()
	wiki.stop()
}

// Ensure PNG decoder is linked for user-supplied 72×72 key art.
var _ = png.Decode
