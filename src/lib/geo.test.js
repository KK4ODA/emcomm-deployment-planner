import { describe, it, expect } from 'vitest';
import { layerLegend, parseGeoFile, parseKml, parseGpx, layerSummary, layerBounds, waypointsOf, kmlColorToCss, routeLengthKm, unionBounds } from './geo';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
  <Style id="course"><LineStyle><color>ff0000ff</color><width>4</width></LineStyle></Style>
  <Folder><name>Course</name>
    <Placemark><name>Marathon route</name><styleUrl>#course</styleUrl>
      <LineString><coordinates>
        -84.3963,33.7550,0 -84.3900,33.7600,0
        -84.3800,33.7700,0
      </coordinates></LineString>
    </Placemark>
    <Placemark><name>Aid 12</name><description>Water and med</description>
      <Point><coordinates>-84.3950,33.7580,0</coordinates></Point>
    </Placemark>
    <Placemark><name>Staging</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-84.40,33.75 -84.39,33.75 -84.39,33.76 -84.40,33.75</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
    <Placemark><name>Both</name><MultiGeometry><Point><coordinates>-84.1,33.1</coordinates></Point><Point><coordinates>-84.2,33.2</coordinates></Point></MultiGeometry></Placemark>
  </Folder>
</Document></kml>`;

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="33.7580" lon="-84.3950"><name>Mile 12</name><desc>Aid station</desc></wpt>
  <trk><name>Course</name><trkseg>
    <trkpt lat="33.7550" lon="-84.3963"></trkpt>
    <trkpt lat="33.7600" lon="-84.3900"></trkpt>
  </trkseg></trk>
  <rte><name>Shuttle</name><rtept lat="33.70" lon="-84.40"/><rtept lat="33.71" lon="-84.41"/></rte>
</gpx>`;

describe('parseKml', () => {
  it('turns placemarks into features with lon/lat order and style colours', () => {
    const fc = parseKml(KML);
    expect(fc.features).toHaveLength(5);
    const route = fc.features.find(f => f.properties.name === 'Marathon route');
    expect(route.geometry.type).toBe('LineString');
    expect(route.geometry.coordinates[0]).toEqual([-84.3963, 33.755]);
    expect(route.properties.color).toBe('#ff0000');
    const aid = fc.features.find(f => f.properties.name === 'Aid 12');
    expect(aid.geometry).toEqual({ type: 'Point', coordinates: [-84.395, 33.758] });
    expect(aid.properties.description).toBe('Water and med');
    expect(fc.features.find(f => f.properties.name === 'Staging').geometry.type).toBe('Polygon');
    expect(fc.features.filter(f => f.properties.name === 'Both')).toHaveLength(2);
  });

  it('rejects malformed XML', () => {
    expect(() => parseKml('<kml><Placemark>')).toThrow(/well-formed/);
  });
});

describe('parseGpx', () => {
  it('reads waypoints, tracks and routes', () => {
    const fc = parseGpx(GPX);
    expect(fc.features.map(f => [f.geometry.type, f.properties.name])).toEqual([
      ['Point', 'Mile 12'], ['LineString', 'Course'], ['LineString', 'Shuttle'],
    ]);
    expect(fc.features[0].properties.description).toBe('Aid station');
  });
});

describe('parseGeoFile', () => {
  it('detects the format from the extension or the content', () => {
    expect(parseGeoFile(GPX, 'course.gpx').features).toHaveLength(3);
    expect(parseGeoFile(KML, 'whatever.txt').features).toHaveLength(5);
    expect(parseGeoFile(JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: null }), 'x.geojson').features[0].properties).toEqual({});
    expect(() => parseGeoFile('hello', 'notes.txt')).toThrow(/Not a KML/);
  });
});

describe('summaries', () => {
  const fc = parseKml(KML);
  it('counts geometry types and picks a kind', () => {
    expect(layerSummary(fc)).toEqual({ points: 3, lines: 1, polygons: 1, features: 5, kind: 'route' });
    expect(layerSummary(parseGpx(GPX)).kind).toBe('route');
    expect(layerSummary({ type: 'FeatureCollection', features: [] }).kind).toBe('points');
  });
  it('computes bounds in Leaflet order', () => {
    expect(layerBounds(fc)).toEqual([[33.1, -84.4], [33.77, -84.1]]);
    expect(layerBounds({ type: 'FeatureCollection', features: [] })).toBeNull();
    expect(unionBounds([[[1, 1], [2, 2]], null, [[0, 3], [1, 4]]])).toEqual([[0, 1], [2, 4]]);
  });
  it('lists waypoints as site candidates', () => {
    expect(waypointsOf(fc)[0]).toEqual({ name: 'Aid 12', description: 'Water and med', lat: 33.758, lon: -84.395 });
    expect(waypointsOf(fc)).toHaveLength(3);
  });
  it('measures route length', () => {
    expect(routeLengthKm(fc)).toBeGreaterThan(1.5);
    expect(routeLengthKm(fc)).toBeLessThan(3);
  });
  it('converts KML aabbggrr colours', () => {
    expect(kmlColorToCss('ff00ff00')).toBe('#00ff00');
    expect(kmlColorToCss('7f0000ff')).toBe('#ff0000');
    expect(kmlColorToCss('nope')).toBeNull();
  });
});

describe('KML styles the way Google My Maps writes them', () => {
  const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Style id="icon-red-normal"><IconStyle><color>ff0000ff</color></IconStyle></Style>
    <Style id="icon-red-highlight"><IconStyle><color>ff0000ff</color></IconStyle></Style>
    <StyleMap id="icon-red"><Pair><key>normal</key><styleUrl>#icon-red-normal</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#icon-red-highlight</styleUrl></Pair></StyleMap>
    <Style id="line-green-normal"><LineStyle><color>ff00ff00</color><width>6.6</width></LineStyle></Style>
    <StyleMap id="line-green"><Pair><key>normal</key><styleUrl>#line-green-normal</styleUrl></Pair></StyleMap>
    <Folder><name>Aid Stations</name>
      <Placemark><name>Aid 2</name><styleUrl>#icon-red</styleUrl><Point><coordinates>-84.38,33.75,0</coordinates></Point></Placemark>
    </Folder>
    <Folder><name>SAG Routes</name>
      <Placemark><name>Approach</name><styleUrl>#line-green</styleUrl><LineString><coordinates>-84.4,33.7,0 -84.41,33.71,0</coordinates></LineString></Placemark>
      <Placemark><name>Inline</name><Style><LineStyle><color>ffff0000</color></LineStyle></Style><LineString><coordinates>-84.4,33.7,0 -84.42,33.72,0</coordinates></LineString></Placemark>
    </Folder>
  </Document></kml>`;
  it('follows StyleMaps to icon and line colours, keeps widths and folders', () => {
    const fc = parseKml(kml);
    expect(fc.features[0].properties).toMatchObject({ name: 'Aid 2', color: '#ff0000', folder: 'Aid Stations' });
    expect(fc.features[1].properties).toMatchObject({ name: 'Approach', color: '#00ff00', width: 4, folder: 'SAG Routes' });
    expect(fc.features[2].properties.color).toBe('#0000ff');
  });
  it('builds a legend per folder with the dominant colour', () => {
    const legend = layerLegend(parseKml(kml));
    expect(legend.map(l => l.label)).toEqual(['Aid Stations', 'SAG Routes']);
    expect(legend[1]).toMatchObject({ count: 2 });
  });
});
