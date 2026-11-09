Visualizer v1.3 – Performance-Update auf Basis v1.2.
Keine künstliche FPS-Grenze; requestAnimationFrame passt sich dem Monitor an (144 Hz möglich, nicht garantiert).
Canvas standardmäßig in CSS-Pixelauflösung; Farbcache pro Frame; unsichtbare Tabs pausieren; Audio-Sample-Lesen bedarfsgerecht.
Offline starten: index.html öffnen. Audioeingabe benötigt je nach Browser HTTPS oder localhost.

Version 1.4: Neon Ribbon Wave only: remove costly shadowBlur, reuse sampled audio/phases per frame, adaptive segment count. All other visualizers unchanged.
