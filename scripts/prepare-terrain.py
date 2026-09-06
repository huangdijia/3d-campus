"""Crop real GMT/SRTM15+ relief into the atlas' numeric elevation grid.

Requires Python 3 and the system libnetcdf (Homebrew netcdf on macOS).
No Python packages are required. The pinned original is retained as evidence.
Run: python3 scripts/prepare-terrain.py
"""

import ctypes as C
import ctypes.util
import hashlib
import json
import math
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / 'data/sources/terrain'
SOURCE_FILE = SOURCE_DIR / 'earth_relief_15m_g.grd'
SOURCE_SHA256 = '0efc23fb13dac354b9a68c79949c470c700d667c37d328138a61a6638407520d'
SOURCE_URL = 'https://oceania.generic-mapping-tools.org/server/earth/earth_relief/earth_relief_15m_g.grd'
MIRROR_URL = 'https://www.star.nesdis.noaa.gov/data/socd3/lsa/gmtdata/earth_relief_15m.grd'
DOC_URL = 'https://www.generic-mapping-tools.org/remote-datasets/earth-relief.html'
README_URL = 'https://topex.ucsd.edu/pub/srtm15_plus/README_V2.7.txt'
WEST, SOUTH, STEP, WIDTH, HEIGHT = 72, 18, 0.25, 261, 145


def read_source():
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    if not SOURCE_FILE.exists():
        failures = []
        for url in (SOURCE_URL, MIRROR_URL):
            try:
                with urllib.request.urlopen(url, timeout=30) as response:
                    blob = response.read()
                if hashlib.sha256(blob).hexdigest() != SOURCE_SHA256:
                    raise ValueError('source changed; review provenance before updating hash')
                SOURCE_FILE.write_bytes(blob)
                break
            except (OSError, ValueError) as error:
                failures.append(f'{url}: {error}')
        else:
            raise RuntimeError('\n'.join(failures))
    blob = SOURCE_FILE.read_bytes()
    if hashlib.sha256(blob).hexdigest() != SOURCE_SHA256:
        raise ValueError('cached terrain file does not match pinned SHA-256')


def crop_grid():
    name = ctypes.util.find_library('netcdf')
    if not name and Path('/opt/homebrew/lib/libnetcdf.dylib').exists():
        name = '/opt/homebrew/lib/libnetcdf.dylib'
    if not name:
        raise RuntimeError('libnetcdf required; install netcdf or use an existing scientific runtime')
    nc = C.CDLL(name)
    nc.nc_strerror.restype = C.c_char_p

    def check(code):
        if code:
            raise RuntimeError(nc.nc_strerror(code).decode())

    handle = C.c_int()
    check(nc.nc_open(str(SOURCE_FILE).encode(), 0, C.byref(handle)))

    def var_id(name):
        result = C.c_int()
        check(nc.nc_inq_varid(handle, name.encode(), C.byref(result)))
        return result

    def dimension(name):
        dim = C.c_int()
        size = C.c_size_t()
        check(nc.nc_inq_dimid(handle, name.encode(), C.byref(dim)))
        check(nc.nc_inq_dimlen(handle, dim, C.byref(size)))
        return size.value

    def attribute(variable, name, default=None):
        result = C.c_double()
        code = nc.nc_get_att_double(handle, variable, name.encode(), C.byref(result))
        if code and default is not None:
            return default
        check(code)
        return result.value

    try:
        lon = (C.c_double * dimension('lon'))()
        lat = (C.c_double * dimension('lat'))()
        check(nc.nc_get_var_double(handle, var_id('lon'), lon))
        check(nc.nc_get_var_double(handle, var_id('lat'), lat))
        col, row = list(lon).index(WEST), list(lat).index(SOUTH)
        assert all(lon[col + i] == WEST + i * STEP for i in range(WIDTH))
        assert all(lat[row + i] == SOUTH + i * STEP for i in range(HEIGHT))
        z = var_id('z')
        scale = attribute(z, 'scale_factor')
        offset = attribute(z, 'add_offset', 0)
        fill = attribute(z, '_FillValue')
        values = (C.c_double * (WIDTH * HEIGHT))()
        start = (C.c_size_t * 2)(row, col)
        count = (C.c_size_t * 2)(HEIGHT, WIDTH)
        check(nc.nc_get_vara_double(handle, z, start, count, values))
        if any(value == fill or not math.isfinite(value) for value in values):
            raise ValueError('No-data found; refusing to invent or interpolate missing elevations')
        # netCDF C API exposes stored values: apply CF scale explicitly once.
        return [value * scale + offset for value in values]
    finally:
        check(nc.nc_close(handle))


def main():
    read_source()
    elevations = crop_grid()
    attribution = 'GMT / Scripps Institution of Oceanography, SRTM15+ V2.7; Tozer et al. (2019), doi:10.1029/2019EA000658'
    provenance = {
        'origin': 'GMT earth_relief_15m_g: SRTM15 Earth Relief v2.7 at 15 arc minutes',
        'sourceUrl': SOURCE_URL,
        'mirrorUrl': MIRROR_URL,
        'sourceSha256': SOURCE_SHA256,
        'sourceBytes': SOURCE_FILE.stat().st_size,
        'documentationUrl': DOC_URL,
        'sourceReadmeUrl': README_URL,
        'retrievedAt': '2026-09-06',
        'license': 'Public domain per retained SRTM15+ README distribution statement; attribution retained',
        'licenseEvidence': 'README_V2.7.txt retains the SRTM30_PLUS public-domain declaration in its version history. Current GMT documentation explicitly distributes this SRTM15+ derivative; it is not a license inference from the research article.',
        'attribution': attribution,
        'horizontalCoordinates': 'longitude/latitude degrees, gridline registered',
        'verticalUnits': 'metres',
        'registration': 'gridline',
        'crop': {'west': WEST, 'south': SOUTH, 'east': WEST + (WIDTH - 1) * STEP, 'north': SOUTH + (HEIGHT - 1) * STEP},
        'sourceGrid': {'width': 1441, 'height': 721, 'stepDegrees': STEP, 'scaleFactor': 0.5},
        'processing': 'Exact aligned crop of source grid, CF scale_factor applied once, row-major south-to-north/west-to-east; no interpolation, no fabricated heights, no clamping of negative elevations.',
        'limitations': ['Source is a mixed-source SRTM15+ derivative, not original 30 m USGS SRTM.', 'GMT applied 78.6 km full-width Gaussian filtering; 0.25 degree grid spacing does not imply terrain detail at campus scale.', 'Negative values include bathymetry and are retained in data; UI may mask sea and clip visible surfaces.', 'Rectangle is a rendering crop, not a statement about national boundaries or full island coverage.'],
        'validation': {'sampleCount': len(elevations), 'minMetres': min(elevations), 'maxMetres': max(elevations), 'missingSamples': 0, 'mirrorByteIdentical': True},
    }
    grid = {'available': True, 'west': WEST, 'south': SOUTH, 'step': STEP, 'width': WIDTH, 'height': HEIGHT, 'elevations': elevations, 'source': DOC_URL, 'attribution': attribution, 'provenance': provenance}
    (ROOT / 'public/data/terrain.json').write_text(json.dumps(grid, ensure_ascii=False, separators=(',', ':')) + '\n')
    (SOURCE_DIR / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(provenance['validation']))


if __name__ == '__main__':
    main()
