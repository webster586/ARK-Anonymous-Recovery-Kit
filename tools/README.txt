ARK v1.4.1 – Download-Werkzeuge
================================

Die ARK-Anwendung benötigt weiterhin keine Installation und kein Python.
Das neue Online-Medien-Downloadmodul verwendet zwei EXTERNE Open-Source-Tools:

1) yt-dlp.exe
   https://github.com/yt-dlp/yt-dlp/releases/latest
2) ffmpeg.exe und optional ffprobe.exe
   https://www.gyan.dev/ffmpeg/builds/
   (Windows Essentials Build)

Erst wenn der Nutzer im Medien-Downloader auf "WERKZEUGE EINRICHTEN"
klickt, lädt ARK die beiden Anwendungen nach tools/ herunter, sofern
nicht bereits über die Windows-PATH-Variable vorhanden.
Dafür ist einmalig Internet nötig; die heruntergeladenen Programme
bleiben lokal. ARK startet weder Autoupdates noch Hintergrunddownloads.

Alternativ: yt-dlp.exe und ffmpeg.exe manuell in DIESEN Ordner kopieren.
Danach ARK-03 Media & Games öffnen und den Downloader aufklappen.

Die Plattformunterstützung hängt von yt-dlp ab. Websites können sich ändern,
Anmeldungen verlangen oder bestimmte Inhalte ausschließen. Es werden keine
Cookie-Daten aus dem Browser heimlich eingelesen und keine Login-Daten
angefordert. Kein Umgehen von DRM oder Zugriffsbeschränkungen vorgesehen.
