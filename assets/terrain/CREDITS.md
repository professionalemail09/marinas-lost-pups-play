# Country terrain images

Each picture is that country's real outline (the same Natural Earth public-domain
polygons used in the games) filled with Natural Earth shaded relief so mountains
and the coastline stay visible.

- **Relief:** Natural Earth I, 50m Shaded Relief, Water (`NE1_50M_SR_W`), public domain.
  https://www.naturalearthdata.com/downloads/50m-raster-data/50m-shaded-relief/
- **Outlines:** Natural Earth admin-0 country polygons, public domain, as simplified
  in `src/geo_countries.js` (world-atlas / Natural Earth).
- **Projection:** the same local equirectangular view World Sniff and Shape Sniffer use,
  so the picture matches the country those modes ask about.
- Files are WebP, masked to the country (transparent outside the shape).

No trademarked map tiles are used.
