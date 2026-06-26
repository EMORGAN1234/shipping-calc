import { useState } from "react";
import { Calculator, Trash2, AlertCircle, Info } from "lucide-react";

// ── ALLOY DATA (ASTM B209 densities lb/in³) ──────────────────────────────────
const ALLOYS = [
  { label: "1100", density: 0.0975 },
  { label: "2024", density: 0.1010 },
  { label: "3003", density: 0.0980 },
  { label: "3004", density: 0.0980 },
  { label: "3005", density: 0.0980 },
  { label: "3105", density: 0.0980 },
  { label: "5052", density: 0.0968 },
  { label: "5083", density: 0.0961 },
  { label: "5086", density: 0.0962 },
  { label: "5182", density: 0.0968 },
  { label: "6061", density: 0.0975 },
  { label: "6063", density: 0.0975 },
  { label: "7075", density: 0.1020 },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const getDensity = alloy => ALLOYS.find(a => a.label === alloy)?.density ?? 0.098;

const getProductType = t => {
  const n = parseFloat(t) || 0;
  if (n <= 0) return null;
  if (n < 0.006) return "FOIL";
  if (n <= 0.249) return "SHEET";
  return "PLATE";
};

const getSaddleWidth = od => {
  if (od <= 32) return 28;
  if (od <= 40) return 34;
  if (od <= 48) return 38;
  if (od <= 56) return 42;
  if (od <= 66) return 46;
  if (od <= 76) return 52;
  return 58;
};

const fmtN = (n, dec = 1) =>
  parseFloat(n).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Returns lbs/piece given a sheet state object — null if inputs incomplete
const computeWtPerPc = s => {
  const density = getDensity(s.alloy);
  const t = parseFloat(s.thickness), w = parseFloat(s.width), l = parseFloat(s.length);
  if (!t || !w || !l || t <= 0 || w <= 0 || l <= 0) return null;
  return l * w * t * density;
};

// ── EXTRUSION PROFILE GEOMETRY ────────────────────────────────────────────────
// Each shape derives a metal cross-section area (in²) and a per-piece outer
// bounding box (pieceW x pieceH). Weight per ft is then area x density x 12.
// Tubes/channel/angle use a uniform-wall model, which is the standard way a
// distributor eyeballs a banded bundle. "custom" lets the user enter wt/ft and
// the piece envelope directly for any profile not listed.
const EXT_SHAPES = [
  { key: "round_bar",   label: "Round Bar",        fields: [["d", "Dia\""]] },
  { key: "square_bar",  label: "Square Bar",       fields: [["s", "Side\""]] },
  { key: "rect_bar",    label: "Rectangle / Flat", fields: [["w", "Width\""], ["h", "Height\""]] },
  { key: "round_tube",  label: "Round Tube / Pipe",fields: [["od", "OD\""], ["wall", "Wall\""]] },
  { key: "square_tube", label: "Square Tube",      fields: [["s", "Side\""], ["wall", "Wall\""]] },
  { key: "rect_tube",   label: "Rectangle Tube",   fields: [["w", "Width\""], ["h", "Height\""], ["wall", "Wall\""]] },
  { key: "angle",       label: "Angle (L)",        fields: [["a", "Leg A\""], ["b", "Leg B\""], ["t", "Thick\""]] },
  { key: "channel",     label: "Channel (C)",      fields: [["cd", "Depth\""], ["cf", "Flange\""], ["ct", "Thick\""]] },
  { key: "custom",      label: "Custom / Other",   fields: [["lbPerFt", "Wt/ft"], ["pieceW", "Piece W\""], ["pieceH", "Piece H\""]] },
];

const getShapeCfg = key => EXT_SHAPES.find(s => s.key === key) || EXT_SHAPES[0];

// Returns { area, lbPerFt, pieceW, pieceH, dimsLabel } or null if incomplete
const extProfile = (s, density) => {
  const num = k => parseFloat(s[k]);
  let area = 0, pieceW = 0, pieceH = 0, lbPerFt = 0, dimsLabel = "";
  switch (s.shape) {
    case "round_bar": {
      const d = num("d");
      if (!d || d <= 0) return null;
      area = Math.PI / 4 * d * d; pieceW = d; pieceH = d;
      dimsLabel = `${d}" dia`;
      break;
    }
    case "square_bar": {
      const sd = num("s");
      if (!sd || sd <= 0) return null;
      area = sd * sd; pieceW = sd; pieceH = sd;
      dimsLabel = `${sd}" sq`;
      break;
    }
    case "rect_bar": {
      const w = num("w"), h = num("h");
      if (!w || !h || w <= 0 || h <= 0) return null;
      area = w * h; pieceW = w; pieceH = h;
      dimsLabel = `${w}" x ${h}"`;
      break;
    }
    case "round_tube": {
      const od = num("od"), wall = num("wall");
      if (!od || !wall || od <= 0 || wall <= 0 || od <= 2 * wall) return null;
      const id = od - 2 * wall;
      area = Math.PI / 4 * (od * od - id * id); pieceW = od; pieceH = od;
      dimsLabel = `${od}" OD x ${wall}" wall`;
      break;
    }
    case "square_tube": {
      const sd = num("s"), wall = num("wall");
      if (!sd || !wall || sd <= 0 || wall <= 0 || sd <= 2 * wall) return null;
      const inner = sd - 2 * wall;
      area = sd * sd - inner * inner; pieceW = sd; pieceH = sd;
      dimsLabel = `${sd}" sq x ${wall}" wall`;
      break;
    }
    case "rect_tube": {
      const w = num("w"), h = num("h"), wall = num("wall");
      if (!w || !h || !wall || w <= 0 || h <= 0 || wall <= 0 || w <= 2 * wall || h <= 2 * wall) return null;
      area = w * h - (w - 2 * wall) * (h - 2 * wall); pieceW = w; pieceH = h;
      dimsLabel = `${w}" x ${h}" x ${wall}" wall`;
      break;
    }
    case "angle": {
      const a = num("a"), b = num("b"), t = num("t");
      if (!a || !b || !t || a <= 0 || b <= 0 || t <= 0 || t >= a || t >= b) return null;
      area = t * (a + b - t); pieceW = b; pieceH = a;
      dimsLabel = `${a}" x ${b}" x ${t}"`;
      break;
    }
    case "channel": {
      const cd = num("cd"), cf = num("cf"), ct = num("ct");
      if (!cd || !cf || !ct || cd <= 0 || cf <= 0 || ct <= 0 || ct >= cf || 2 * ct >= cd) return null;
      // Uniform-wall C: web (depth) + two flanges, minus corner overlap.
      area = ct * (cd + 2 * (cf - ct)); pieceW = cf; pieceH = cd;
      dimsLabel = `${cd}" deep x ${cf}" flange x ${ct}"`;
      break;
    }
    case "custom": {
      const lpf = num("lbPerFt"), pw = num("pieceW"), ph = num("pieceH");
      if (!lpf || !pw || !ph || lpf <= 0 || pw <= 0 || ph <= 0) return null;
      lbPerFt = lpf; pieceW = pw; pieceH = ph;
      area = lpf / (density * 12);
      dimsLabel = `${lpf} lb/ft, ${pw}" x ${ph}"`;
      return { area, lbPerFt, pieceW, pieceH, dimsLabel };
    }
    default:
      return null;
  }
  lbPerFt = area * density * 12;
  return { area, lbPerFt, pieceW, pieceH, dimsLabel };
};

// Tight-pack a bundle of N identical pieces into a near-square cross-section.
const packBundle = (pieceW, pieceH, N) => {
  if (N <= 1) return { perRow: 1, rows: 1, bundleW: pieceW, bundleH: pieceH };
  const targetSide = Math.sqrt(N * pieceW * pieceH);
  let perRow = Math.max(1, Math.round(targetSide / pieceW));
  perRow = Math.min(perRow, N);
  const rows = Math.ceil(N / perRow);
  return { perRow, rows, bundleW: perRow * pieceW, bundleH: rows * pieceH };
};

// Length helper — returns length in FEET, or null. unit is "in" or "ft".
const getLenFt = s => {
  const v = parseFloat(s.length);
  if (!v || v <= 0) return null;
  return s.lengthUnit === "ft" ? v : v / 12;
};

// Returns lbs/piece for an extrusion state — null if inputs incomplete
const computeExtWtPerPc = s => {
  const prof = extProfile(s, getDensity(s.alloy));
  const Lft = getLenFt(s);
  if (!prof || !Lft) return null;
  return prof.lbPerFt * Lft;
};

// ── COIL GEOMETRY ─────────────────────────────────────────────────────────────
// Single-coil geometry, shared by the live preview and the full calc.
function coilGeom({ alloy, thickness, width, weight, coreId }) {
  const density = getDensity(alloy);
  const t = parseFloat(thickness), w = parseFloat(width);
  const lbs = parseFloat(weight), id = parseFloat(coreId);
  if (!t || !w || !lbs || !id || t <= 0 || w <= 0 || lbs <= 0 || id <= 0) return null;
  const volIn3   = lbs / density;
  const lengthIn = volIn3 / (t * w);
  const lengthFt = lengthIn / 12;
  const od       = Math.sqrt((4 * lengthIn * t) / Math.PI + id * id);
  if (od <= id) return { error: "Calculated OD <= Core ID - check gauge, width, or weight." };
  return { density, volIn3, lengthIn, lengthFt, od, w, lbs, id };
}

// ── COIL COUNT PER SKID ───────────────────────────────────────────────────────
// Manual mode: use the entered count. Auto mode: fit as many coils as the skid
// weight cap allows AND the space dimension that grows with each coil — row
// length when eye-to-side (coils lined up side by side), stack height when
// eye-to-sky (coils laid flat on top of each other). The smaller wins.
function coilCount(coilIn, geom) {
  const orient = coilIn.stackOrient === "sky" ? "sky" : "side";
  if (!coilIn.autoCoils) {
    let n = parseInt(coilIn.coilsPerSkid);
    if (!n || n < 1) n = 1;
    return { n, orient, limit: null };
  }
  const w = geom.w, lbs = geom.lbs;
  const maxWt = parseFloat(coilIn.maxSkidWt) || 0;
  const byWt  = (maxWt > 0 && lbs > 0) ? Math.floor(maxWt / lbs) : 9999;
  let byDim = 9999;
  const dimName = orient === "sky" ? "height" : "row length";
  if (orient === "sky") {
    const maxH = parseFloat(coilIn.maxStackH) || 0;
    if (maxH > 0 && w > 0) byDim = Math.floor((maxH - 6) / w);
  } else {
    const maxLen = parseFloat(coilIn.maxRowLen) || 0;
    if (maxLen > 0 && w > 0) byDim = Math.floor((maxLen - 4) / w);
  }
  const n = Math.max(1, Math.min(byWt, byDim));
  const limit = byWt <= byDim ? "weight" : dimName;
  return { n, orient, limit, byWt, byDim };
}

// ── CALC: COIL ────────────────────────────────────────────────────────────────
function calcCoil(coilIn) {
  const geom = coilGeom(coilIn);
  if (!geom) return null;
  if (geom.error) return { error: geom.error };
  const { density, volIn3, lengthIn, lengthFt, od, w } = geom;
  const lbs = geom.lbs;
  const t = parseFloat(coilIn.thickness);
  const { n: N, orient, limit } = coilCount(coilIn, geom);

  const skidH = 6;
  let footLen, footWid, totalH;
  if (orient === "side") {
    // axis horizontal, coils nested side by side in a saddle
    footLen = N * w + 4;             // 2" clearance each end
    footWid = getSaddleWidth(od);
    totalH  = od + skidH;
  } else {
    // eye to sky, coils laid flat and stacked on top of each other
    footLen = od;
    footWid = od;
    totalH  = N * w + skidH;
  }

  const perCoilWt = lbs;
  const bundleWt  = lbs * N;
  const prodType  = getProductType(t);

  const flags = [];
  if (coilIn.autoCoils) {
    const cap = (parseFloat(coilIn.maxSkidWt) || 0).toLocaleString();
    const limLbl = limit === "weight" ? `weight-limited at ${cap} lbs/skid` : `${limit}-limited`;
    flags.push({ level: "info", msg: `Auto-fit ${N} coil${N === 1 ? "" : "s"} per skid (${limLbl})  -  change the skid weight cap or switch to manual to override` });
  }
  if (od > 72)      flags.push({ level: "warn", msg: `OD ${fmtN(od)}" exceeds 72"  -  verify skid/saddle load rating and coil handling equipment` });
  else if (od > 60) flags.push({ level: "info", msg: `Large OD (${fmtN(od)}")  -  confirm saddle and handling equipment are rated for this diameter` });
  if (totalH > 96)      flags.push({ level: "danger", msg: `Stack height ${fmtN(totalH)}" >96"  -  specialized freight or open-top trailer may be required` });
  else if (totalH > 72) flags.push({ level: "warn",   msg: `Stack height ${fmtN(totalH)}"  -  verify dock door height and warehouse rack clearance` });
  if (bundleWt > 20000)      flags.push({ level: "danger", msg: `Skid total ${bundleWt.toLocaleString()} lbs >20,000  -  heavy-lift equipment required` });
  else if (bundleWt > 15000) flags.push({ level: "warn",   msg: `Skid total ${bundleWt.toLocaleString()} lbs  -  verify forklift rated capacity` });
  if (lengthFt > 8000) flags.push({ level: "info", msg: `Very long coil (${Math.round(lengthFt).toLocaleString()} ft)  -  confirm weld count with supplier` });
  if (orient === "side" && N > 1 && od > 1.5 * footLen) {
    flags.push({ level: "info", msg: `Tall narrow stack (OD ${fmtN(od)}" over a ${fmtN(footLen)}" base)  -  eye-to-sky stacking may ship more stably for ${N} narrow coils` });
  }

  return {
    density, volIn3: Math.round(volIn3),
    lengthIn: Math.round(lengthIn), lengthFt: Math.round(lengthFt),
    od: fmtN(od), odNum: od, orient, N, width: w, autoCoils: !!coilIn.autoCoils, limit,
    footLen: fmtN(footLen), footWid: fmtN(footWid, 0), skidH,
    totalH: fmtN(totalH), totalHNum: totalH,
    perCoilWt, bundleWt, prodType, flags,
  };
}

// ── CALC: SHEET / PLATE ───────────────────────────────────────────────────────
function calcSheet({ alloy, thickness, width, length, qty }) {
  const density = getDensity(alloy);
  const t = parseFloat(thickness), w = parseFloat(width);
  const l = parseFloat(length),    q = parseInt(qty);
  if (!t || !w || !l || !q || t <= 0 || w <= 0 || l <= 0 || q <= 0) return null;
  const wtPerPc  = l * w * t * density;
  const totalWt  = wtPerPc * q;
  const stackThk = q * t + Math.max(0, q - 1) * 0.004;
  const dunnage  = 1.0;
  const skidH    = 5.5;
  const totalH   = stackThk + dunnage + skidH;
  const skidLen  = l + 4;
  const skidWid  = w + 4;
  const prodType = getProductType(t);
  const flags = [];
  if (prodType === "PLATE") flags.push({ level: "info", msg: `Plate classification (>= .250")  -  edge/corner protection recommended in transit` });
  if (wtPerPc > 500)       flags.push({ level: "warn",   msg: `Individual piece ${fmtN(wtPerPc, 0)} lbs  -  mechanical handling required` });
  else if (wtPerPc > 300)  flags.push({ level: "info",   msg: `Individual piece ${fmtN(wtPerPc, 0)} lbs  -  mechanical assist recommended` });
  if (totalWt > 20000)     flags.push({ level: "danger", msg: `Bundle total >20,000 lbs  -  heavy-lift equipment required` });
  else if (totalWt > 4000) flags.push({ level: "warn",   msg: `Bundle total ${fmtN(totalWt, 0)} lbs  -  verify forklift capacity` });
  if (skidLen > 240) flags.push({ level: "danger", msg: `Skid length ${skidLen}"  -  flatbed or specialized freight likely required` });
  else if (l > 192)  flags.push({ level: "warn",   msg: `Sheet length ${l}"  -  verify dock/trailer clearance for unloading` });
  return {
    density, wtPerPc: wtPerPc.toFixed(1), totalWt: totalWt.toFixed(1),
    stackThk: stackThk.toFixed(3), totalH: totalH.toFixed(1),
    skidLen: skidLen.toFixed(0), skidWid: skidWid.toFixed(0),
    skidH, prodType, flags,
  };
}

// ── CALC: EXTRUSION ───────────────────────────────────────────────────────────
function calcExtrusion(s) {
  const density = getDensity(s.alloy);
  const prof = extProfile(s, density);
  const Lft  = getLenFt(s);
  const q    = parseInt(s.qty);
  if (!prof || !Lft || !q || q <= 0) return null;

  const lengthIn = Lft * 12;
  const wtPerPc  = prof.lbPerFt * Lft;
  const totalWt  = wtPerPc * q;
  const pack     = packBundle(prof.pieceW, prof.pieceH, q);
  const bunkH    = 4;
  const totalH   = pack.bundleH + bunkH;
  const footLen  = lengthIn;
  const footWid  = pack.bundleW;

  const flags = [];
  if (lengthIn > 288)      flags.push({ level: "warn", msg: `Stock length ${fmtN(Lft, 0)} ft (${Math.round(lengthIn)}")  -  flatbed or 53' trailer required; verify overhang and side-load access` });
  else if (lengthIn > 240) flags.push({ level: "info", msg: `Long stock ${fmtN(Lft, 0)} ft  -  confirm trailer length and dock clearance for unloading` });
  if (totalWt > 20000)     flags.push({ level: "danger", msg: `Bundle total >20,000 lbs  -  heavy-lift equipment required` });
  else if (totalWt > 4000) flags.push({ level: "warn",   msg: `Bundle total ${fmtN(totalWt, 0)} lbs  -  verify forklift capacity` });
  if (wtPerPc > 300)       flags.push({ level: "info", msg: `Heavy single length ${fmtN(wtPerPc, 0)} lbs/pc  -  mechanical handling recommended` });
  flags.push({ level: "info", msg: `Bundle cross-section estimated at ${fmtN(pack.bundleW, 1)}" x ${fmtN(pack.bundleH, 1)}" from ${q} pcs (${pack.perRow} across x ${pack.rows} high, tight pack)  -  band orientation may differ; treat footprint as a planning estimate` });

  return {
    density, shapeLabel: getShapeCfg(s.shape).label, dimsLabel: prof.dimsLabel,
    lbPerFt: prof.lbPerFt.toFixed(3), area: prof.area.toFixed(3),
    wtPerPc: wtPerPc.toFixed(1), totalWt: totalWt.toFixed(1),
    lengthIn: Math.round(lengthIn), lengthFt: Lft,
    N: q, pieceW: fmtN(prof.pieceW, 2), pieceH: fmtN(prof.pieceH, 2),
    perRow: pack.perRow, rows: pack.rows,
    bundleW: fmtN(pack.bundleW, 1), bundleH: fmtN(pack.bundleH, 1),
    bunkH, totalH: totalH.toFixed(1),
    footLen: Math.round(footLen), footWid: fmtN(pack.bundleW, 1),
    prodType: "EXTRUSION", flags,
  };
}

// ── SHARED: FLAG BANNERS ──────────────────────────────────────────────────────
function FlagBanner({ flag }) {
  const map = {
    danger: "bg-red-50 border-red-400 text-red-800",
    warn:   "bg-amber-50 border-amber-400 text-amber-900",
    info:   "bg-neutral-100 border-neutral-300 text-neutral-700",
  };
  const icon = { danger: "⚠", warn: "⚠", info: "◈" };
  return (
    <div className={`${map[flag.level]} border p-3 mb-2 rounded-xl flex items-start gap-3`}>
      <span className="flex-shrink-0 mt-0.5">{icon[flag.level]}</span>
      <p className="text-sm font-semibold">{flag.msg}</p>
    </div>
  );
}

// ── COIL DETAIL CARD ──────────────────────────────────────────────────────────
function CoilDetail({ result, inputs }) {
  const totalHNum  = result.totalHNum;
  const heightOk   = totalHNum <= 72;
  const heightWarn = totalHNum > 72 && totalHNum <= 96;
  const N          = result.N;
  const orientLbl  = result.orient === "sky" ? "eye to sky, stacked flat" : "eye to side, in saddle";

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white px-5 py-4">
        <h2 className="text-lg font-bold tracking-wide flex items-center gap-3">
          Shipping Dimensions — Coil
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-600 text-white border border-neutral-500">
            {result.prodType}
          </span>
          {N > 1 && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-700 text-white">
              {N} / SKID
            </span>
          )}
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          {inputs.alloy} @ {inputs.thickness}" | {inputs.width}" wide | {result.perCoilWt.toLocaleString()} lbs/coil | {inputs.coreId}" core | {N} coil{N === 1 ? "" : "s"}/skid ({orientLbl})
        </p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Coil Geometry</p>
            <p className="text-sm font-medium text-neutral-600">Outer Diameter</p>
            <p className="text-3xl font-extrabold text-neutral-900">{result.od}"</p>
            <div className="mt-2 pt-2 border-t border-neutral-200 space-y-0.5">
              <p className="text-sm"><span className="font-medium text-neutral-600">Core I.D.:</span> <span className="font-bold">{inputs.coreId}"</span></p>
              <p className="text-sm"><span className="font-medium text-neutral-600">Length:</span> <span className="font-bold">{result.lengthIn.toLocaleString()}"</span></p>
              <p className="text-sm pl-3"><span className="font-bold text-neutral-500">{result.lengthFt.toLocaleString()} ft</span></p>
              <p className="text-sm"><span className="font-medium text-neutral-600">Volume:</span> <span className="font-bold">{result.volIn3.toLocaleString()} in³</span></p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Skid Footprint</p>
            <p className="text-sm font-medium text-neutral-600">{result.orient === "sky" ? "Pad Diameter" : "Skid Length (axis)"}</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.footLen}"</p>
            <p className="text-xs text-neutral-400 mb-2">{result.orient === "sky" ? "coil OD footprint" : `${N} x width + 2" each end`}</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">{result.orient === "sky" ? "Pad Width:" : "Saddle Width:"}</span> <span className="font-bold">{result.footWid}"</span></p>
            <p className="text-xs text-neutral-400">{result.orient === "sky" ? "coil OD footprint" : "scales to OD"}</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Skid Height:</span> <span className="font-bold">{result.skidH}"</span></p>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Total Stack Height</p>
            <p className="text-3xl font-extrabold text-neutral-900">{result.totalH}"</p>
            <p className="text-xs text-neutral-400 mb-2">floor to top</p>
            <div className="pt-1 border-t border-neutral-200 space-y-1 text-xs">
              {result.orient === "sky" ? (
                <div className="flex justify-between">
                  <span className="text-neutral-500">{N} x {inputs.width}" width</span>
                  <span className="font-bold text-neutral-700">{fmtN(N * result.width)}"</span>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-neutral-500">OD</span>
                  <span className="font-bold text-neutral-700">{result.od}"</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-neutral-500">+ Skid</span>
                <span className="font-bold text-neutral-700">{result.skidH}"</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1">
                <span className="font-bold text-neutral-800">= Total</span>
                <span className="font-bold text-red-700">{result.totalH}"</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200">
            <p className="font-bold text-amber-700 mb-2 text-sm uppercase tracking-wide">📦 Freight Profile</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Footprint:</span> <span className="font-bold">{result.footLen}" × {result.footWid}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Height:</span> <span className="font-bold">{result.totalH}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Per Coil:</span> <span className="font-bold">{result.perCoilWt.toLocaleString()} lbs</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Skid Total:</span> <span className="font-bold text-red-700">{result.bundleWt.toLocaleString()} lbs</span> <span className="text-xs text-neutral-400">({N} x)</span></p>
            <div className="mt-2 pt-2 border-t border-amber-200">
              <p className={`text-xs font-semibold ${heightOk ? "text-green-700" : heightWarn ? "text-amber-700" : "text-red-700"}`}>
                {heightOk ? "✓ Standard dock clearance" : heightWarn ? "⚠ Verify dock/rack clearance" : "⛔ Oversized — special freight"}
              </p>
            </div>
          </div>
        </div>

        {result.flags.length > 0 && (
          <div className="mb-4">{result.flags.map((f, i) => <FlagBanner key={i} flag={f} />)}</div>
        )}

        <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-4 rounded-xl font-bold text-sm shadow-lg">
          <p className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-400">⬡</span>
            {inputs.alloy} @ {inputs.thickness}" | {inputs.width}" wide | OD: <span className="text-red-400">{result.od}"</span> |
            {N} / skid | Skid: {result.footLen}" × {result.footWid}" |
            <span className="text-amber-400">Total Height: {result.totalH}"</span> | {result.bundleWt.toLocaleString()} lbs
          </p>
        </div>
      </div>
    </div>
  );
}

// ── SHEET / PLATE DETAIL CARD ─────────────────────────────────────────────────
function SheetDetail({ result, inputs }) {
  const q        = parseInt(inputs.qty);
  const skidLenN = parseFloat(result.skidLen);
  const skidOk   = skidLenN <= 144;
  const skidWarn = skidLenN > 144 && skidLenN <= 240;

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white px-5 py-4">
        <h2 className="text-lg font-bold tracking-wide flex items-center gap-3">
          Shipping Dimensions — {result.prodType}
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${result.prodType === "PLATE" ? "bg-red-700 text-white" : "bg-neutral-600 text-white border border-neutral-500"}`}>
            {result.prodType}
          </span>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          {inputs.alloy} @ {inputs.thickness}" | {inputs.width}" × {inputs.length}" | {q} {q === 1 ? "pc" : "pcs"} | Density: {result.density} lb/in³
        </p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Piece / Bundle</p>
            <p className="text-sm font-medium text-neutral-600">Weight / Piece</p>
            <p className="text-2xl font-extrabold text-neutral-900">{parseFloat(result.wtPerPc).toLocaleString()} lbs</p>
            <div className="mt-2 pt-2 border-t border-neutral-200 space-y-0.5">
              <p className="text-sm"><span className="font-medium text-neutral-600">Qty:</span> <span className="font-bold">{q.toLocaleString()} pcs</span></p>
              <p className="text-sm"><span className="font-medium text-neutral-600">Total Weight:</span> <span className="font-bold text-red-700">{parseFloat(result.totalWt).toLocaleString()} lbs</span></p>
              <p className="text-sm"><span className="font-medium text-neutral-600">Product:</span> <span className="font-bold">{result.prodType}</span></p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Stack Profile</p>
            <p className="text-3xl font-extrabold text-neutral-900">{result.totalH}"</p>
            <p className="text-xs text-neutral-400 mb-2">total stack height</p>
            <div className="pt-1 border-t border-neutral-200 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">{q} × {inputs.thickness}" + interleave</span>
                <span className="font-bold text-neutral-700">{result.stackThk}"</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Dunnage</span>
                <span className="font-bold text-neutral-700">1.0"</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Skid</span>
                <span className="font-bold text-neutral-700">{result.skidH}"</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1">
                <span className="font-bold text-neutral-800">= Total</span>
                <span className="font-bold text-red-700">{result.totalH}"</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Skid Footprint</p>
            <p className="text-sm font-medium text-neutral-600">Skid Length</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.skidLen}"</p>
            <p className="text-xs text-neutral-400 mb-2">sheet length + 2" each end</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Skid Width:</span> <span className="font-bold">{result.skidWid}"</span></p>
            <p className="text-xs text-neutral-400">sheet width + 2" each side</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Skid Height:</span> <span className="font-bold">{result.skidH}"</span></p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200">
            <p className="font-bold text-amber-700 mb-2 text-sm uppercase tracking-wide">📦 Freight Profile</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Footprint:</span> <span className="font-bold">{result.skidLen}" × {result.skidWid}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Height:</span> <span className="font-bold">{result.totalH}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Bundle Wt:</span> <span className="font-bold">{parseFloat(result.totalWt).toLocaleString()} lbs</span></p>
            <div className="mt-2 pt-2 border-t border-amber-200">
              <p className={`text-xs font-semibold ${skidOk ? "text-green-700" : skidWarn ? "text-amber-700" : "text-red-700"}`}>
                {skidOk ? "✓ Standard trailer length" : skidWarn ? "⚠ Long load — verify trailer" : "⛔ Oversized — special freight"}
              </p>
            </div>
          </div>
        </div>

        {result.flags.length > 0 && (
          <div className="mb-4">{result.flags.map((f, i) => <FlagBanner key={i} flag={f} />)}</div>
        )}

        <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-4 rounded-xl font-bold text-sm shadow-lg">
          <p className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-400">📋</span>
            {inputs.alloy} @ {inputs.thickness}" | {inputs.width}" × {inputs.length}" × {q} pcs |
            {parseFloat(result.totalWt).toLocaleString()} lbs |
            Skid: {result.skidLen}" × {result.skidWid}" |
            <span className="text-amber-400">Total Height: {result.totalH}"</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── EXTRUSION DETAIL CARD ─────────────────────────────────────────────────────
function ExtrusionDetail({ result, inputs }) {
  const q       = result.N;
  const lenIn   = result.lengthIn;
  const lenOk   = lenIn <= 240;
  const lenWarn = lenIn > 240 && lenIn <= 288;

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white px-5 py-4">
        <h2 className="text-lg font-bold tracking-wide flex items-center gap-3">
          Shipping Dimensions — Extrusion
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-600 text-white border border-neutral-500">
            {result.shapeLabel}
          </span>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          {inputs.alloy} {result.dimsLabel} | {result.lbPerFt} lb/ft | {fmtN(result.lengthFt, 1)} ft lengths | {q} {q === 1 ? "pc" : "pcs"} | X-sec: {result.area} in² | Density: {result.density} lb/in³
        </p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Piece / Bundle</p>
            <p className="text-sm font-medium text-neutral-600">Weight / Piece</p>
            <p className="text-2xl font-extrabold text-neutral-900">{parseFloat(result.wtPerPc).toLocaleString()} lbs</p>
            <div className="mt-2 pt-2 border-t border-neutral-200 space-y-0.5">
              <p className="text-sm"><span className="font-medium text-neutral-600">Length:</span> <span className="font-bold">{fmtN(result.lengthFt, 1)} ft ({result.lengthIn.toLocaleString()}")</span></p>
              <p className="text-sm"><span className="font-medium text-neutral-600">Qty:</span> <span className="font-bold">{q.toLocaleString()} pcs</span></p>
              <p className="text-sm"><span className="font-medium text-neutral-600">Total Weight:</span> <span className="font-bold text-red-700">{parseFloat(result.totalWt).toLocaleString()} lbs</span></p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Bundle / Stack</p>
            <p className="text-3xl font-extrabold text-neutral-900">{result.totalH}"</p>
            <p className="text-xs text-neutral-400 mb-2">total stack height</p>
            <div className="pt-1 border-t border-neutral-200 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">Bundle Height (est)</span>
                <span className="font-bold text-amber-700">{result.bundleH}"</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Bundle Width (est)</span>
                <span className="font-bold text-amber-700">{result.bundleW}"</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Bunks</span>
                <span className="font-bold text-neutral-700">{result.bunkH}"</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1">
                <span className="font-bold text-neutral-800">= Total H</span>
                <span className="font-bold text-red-700">{result.totalH}"</span>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Profile / Pack</p>
            <p className="text-sm font-medium text-neutral-600">Per Piece (W x H)</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.pieceW}" × {result.pieceH}"</p>
            <p className="text-xs text-neutral-400 mb-2">{result.dimsLabel}</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Pack:</span> <span className="font-bold">{result.perRow} across × {result.rows} high</span></p>
            <p className="text-xs text-neutral-400">tight-pack estimate</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Bunk Length:</span> <span className="font-bold">{result.footLen}"</span></p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200">
            <p className="font-bold text-amber-700 mb-2 text-sm uppercase tracking-wide">📦 Freight Profile</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Footprint:</span> <span className="font-bold">{result.footLen}" × {result.footWid}" est</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Height:</span> <span className="font-bold">{result.totalH}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Bundle Wt:</span> <span className="font-bold">{parseFloat(result.totalWt).toLocaleString()} lbs</span></p>
            <div className="mt-2 pt-2 border-t border-amber-200">
              <p className={`text-xs font-semibold ${lenOk ? "text-green-700" : lenWarn ? "text-amber-700" : "text-red-700"}`}>
                {lenOk ? "✓ Standard trailer length" : lenWarn ? "⚠ Long load — verify trailer" : "⛔ Oversized — flatbed / special"}
              </p>
            </div>
          </div>
        </div>

        {result.flags.length > 0 && (
          <div className="mb-4">{result.flags.map((f, i) => <FlagBanner key={i} flag={f} />)}</div>
        )}

        <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-4 rounded-xl font-bold text-sm shadow-lg">
          <p className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-400">⫼</span>
            {inputs.alloy} {result.dimsLabel} | {fmtN(result.lengthFt, 1)} ft × {q} pcs |
            {parseFloat(result.totalWt).toLocaleString()} lbs |
            Bundle: {result.footLen}" L × {result.footWid}" W |
            <span className="text-amber-400">Total Height: {result.totalH}"</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── TECH REFERENCE ────────────────────────────────────────────────────────────
function TechRef() {
  const [collapsed, setCollapsed] = useState(true);
  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      <div
        className="bg-gradient-to-r from-neutral-700 to-neutral-800 text-white px-5 py-4 cursor-pointer flex items-center justify-between"
        onClick={() => setCollapsed(v => !v)}
      >
        <h2 className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Info className="w-4 h-4" />Technical Reference — Densities &amp; Formulas
        </h2>
        <span className="text-xs text-neutral-400">{collapsed ? "▶ expand" : "▼ collapse"}</span>
      </div>
      {!collapsed && (
        <div className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-sm">
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Alloy Densities (lb/in³)</p>
              <div className="space-y-1">
                {ALLOYS.map(a => (
                  <div key={a.label} className="flex justify-between text-xs py-0.5 border-b border-neutral-100">
                    <span className="font-medium text-neutral-700">{a.label}</span>
                    <span className="font-mono text-neutral-600">{a.density}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Coil Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Volume:</span> Weight / Density</p>
                <p><span className="font-bold text-neutral-800">Length:</span> Volume / (Gauge x Width)</p>
                <p><span className="font-bold text-neutral-800">OD:</span> sqrt(4 x L x t / pi + ID²)</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">
                  <span className="font-bold text-neutral-800">Eye to side:</span> coils nested in a saddle, height = OD + 6", footprint = (coils x width + 4") x saddle width.
                </p>
                <p><span className="font-bold text-neutral-800">Eye to sky:</span> coils laid flat and stacked, height = coils x width + 6", footprint = OD x OD.</p>
              </div>
            </div>
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Sheet / Plate Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Wt/Pc:</span> L x W x t x Density</p>
                <p><span className="font-bold text-neutral-800">Stack:</span> Qty x Gauge + (Qty-1) x 0.004" interleave (standard kraft paper)</p>
                <p><span className="font-bold text-neutral-800">Total H:</span> Stack + 1.0" dunnage + 5.5" skid</p>
                <p><span className="font-bold text-neutral-800">Skid L:</span> Sheet Length + 4"</p>
                <p><span className="font-bold text-neutral-800">Skid W:</span> Sheet Width + 4"</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">Plate &gt;= .250" per ASTM B209. Sheet &lt;= .249".</p>
              </div>
            </div>
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Extrusion Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Area:</span> from profile shape + size (bar, tube, angle, channel)</p>
                <p><span className="font-bold text-neutral-800">Wt/ft:</span> Area x Density x 12</p>
                <p><span className="font-bold text-neutral-800">Wt/Pc:</span> Wt-per-ft x Length(ft)</p>
                <p><span className="font-bold text-neutral-800">Total Wt:</span> Wt/Pc x Qty</p>
                <p><span className="font-bold text-neutral-800">Bundle:</span> N pieces tight-packed near-square; height = bundle H + 4" bunks.</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">Enter the profile shape and size plus pcs (or total weight). Tube/angle/channel use a uniform-wall model. Bundle footprint is a planning estimate; actual band orientation may differ.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function ShippingCalc() {
  const [mode, setMode] = useState("coil");

  const [coilIn, setCoilIn] = useState({
    alloy: "5052", thickness: "", width: "", weight: "", coreId: "20",
    coilsPerSkid: "1", stackOrient: "side",
    autoCoils: true, maxSkidWt: "5000", maxStackH: "72", maxRowLen: "96",
  });
  const [coilResult, setCoilResult] = useState(null);

  const [sheetIn, setSheetIn] = useState({
    alloy: "5052", thickness: "", width: "", length: "", qty: "", totalWt: "",
  });
  const [sheetResult, setSheetResult] = useState(null);

  const [extIn, setExtIn] = useState({
    alloy: "6063", shape: "round_bar",
    d: "", s: "", w: "", h: "", od: "", wall: "", a: "", b: "", t: "",
    cd: "", cf: "", ct: "",
    lbPerFt: "", pieceW: "", pieceH: "",
    length: "", lengthUnit: "in", qty: "", totalWt: "",
  });
  const [extResult, setExtResult] = useState(null);

  // ── Sheet field updater — keeps qty and totalWt in sync ────────────────────
  const updateSheet = (key, val) => {
    setSheetIn(prev => {
      const next = { ...prev, [key]: val };
      const wtPerPc = computeWtPerPc(next);
      if (wtPerPc && wtPerPc > 0) {
        if (key === "qty") {
          const q = parseInt(val);
          next.totalWt = q > 0 ? (q * wtPerPc).toFixed(1) : "";
        } else if (key === "totalWt") {
          const lbs = parseFloat(val);
          next.qty = lbs > 0 ? String(Math.round(lbs / wtPerPc)) : "";
        } else {
          if (next.qty && parseInt(next.qty) > 0) {
            next.totalWt = (parseInt(next.qty) * wtPerPc).toFixed(1);
          } else if (next.totalWt && parseFloat(next.totalWt) > 0) {
            next.qty = String(Math.round(parseFloat(next.totalWt) / wtPerPc));
          }
        }
      }
      return next;
    });
  };

  // ── Extrusion field updater — keeps qty and totalWt in sync ─────────────────
  const updateExt = (key, val) => {
    setExtIn(prev => {
      const next = { ...prev, [key]: val };
      const wtPerPc = computeExtWtPerPc(next);
      if (wtPerPc && wtPerPc > 0) {
        if (key === "qty") {
          const q = parseInt(val);
          next.totalWt = q > 0 ? (q * wtPerPc).toFixed(1) : "";
        } else if (key === "totalWt") {
          const lbs = parseFloat(val);
          next.qty = lbs > 0 ? String(Math.round(lbs / wtPerPc)) : "";
        } else {
          // shape, dim, length, alloy changed — qty takes priority
          if (next.qty && parseInt(next.qty) > 0) {
            next.totalWt = (parseInt(next.qty) * wtPerPc).toFixed(1);
          } else if (next.totalWt && parseFloat(next.totalWt) > 0) {
            next.qty = String(Math.round(parseFloat(next.totalWt) / wtPerPc));
          }
        }
      }
      return next;
    });
  };

  // ── Length unit toggle — converts the entered number so physical length holds ─
  const setExtUnit = unit => {
    setExtIn(prev => {
      if (prev.lengthUnit === unit) return prev;
      let nl = prev.length;
      const v = parseFloat(prev.length);
      if (v && v > 0) {
        const conv = unit === "ft" ? v / 12 : v * 12;
        nl = String(parseFloat(conv.toFixed(4)));
      }
      return { ...prev, lengthUnit: unit, length: nl };
    });
  };

  const setC = key => val => setCoilIn(p => ({ ...p, [key]: val }));

  const doCoilCalc  = () => setCoilResult(calcCoil(coilIn));
  const doSheetCalc = () => setSheetResult(calcSheet(sheetIn));
  const doExtCalc   = () => setExtResult(calcExtrusion(extIn));
  const coilKey     = e => { if (e.key === "Enter") doCoilCalc(); };
  const sheetKey    = e => { if (e.key === "Enter") doSheetCalc(); };
  const extKey      = e => { if (e.key === "Enter") doExtCalc(); };

  const handleClear = () => {
    setCoilIn({ alloy: "5052", thickness: "", width: "", weight: "", coreId: "20", coilsPerSkid: "1", stackOrient: "side", autoCoils: true, maxSkidWt: "5000", maxStackH: "72", maxRowLen: "96" });
    setSheetIn({ alloy: "5052", thickness: "", width: "", length: "", qty: "", totalWt: "" });
    setExtIn({
      alloy: "6063", shape: "round_bar",
      d: "", s: "", w: "", h: "", od: "", wall: "", a: "", b: "", t: "",
      cd: "", cf: "", ct: "",
      lbPerFt: "", pieceW: "", pieceH: "",
      length: "", lengthUnit: "in", qty: "", totalWt: "",
    });
    setCoilResult(null);
    setSheetResult(null);
    setExtResult(null);
  };

  const liveWtPerPc    = computeWtPerPc(sheetIn);
  const liveCoilGeom   = coilGeom(coilIn);
  const liveCoilCount  = (liveCoilGeom && !liveCoilGeom.error) ? coilCount(coilIn, liveCoilGeom) : null;
  const coilNarrow     = parseFloat(coilIn.width) > 0 && parseFloat(coilIn.coreId) > 0 && parseFloat(coilIn.width) < parseFloat(coilIn.coreId);
  const liveExtWtPerPc = computeExtWtPerPc(extIn);
  const liveExtProfile = extProfile(extIn, getDensity(extIn.alloy));
  const extShapeCfg    = getShapeCfg(extIn.shape);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        .glass-card { background: rgba(255,255,255,0.97); backdrop-filter: blur(20px); }
        .pulse-glow { animation: pulse-glow 2s ease-in-out infinite; }
        @keyframes pulse-glow {
          0%,100% { box-shadow: 0 0 5px rgba(220,38,38,0.3); }
          50%      { box-shadow: 0 0 20px rgba(220,38,38,0.6); }
        }
      `}} />

      <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-black p-4 sm:p-6"
           style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-6xl mx-auto">

          {/* ── MAIN INPUT CARD ── */}
          <div className="glass-card rounded-2xl shadow-2xl p-5 mb-5 border-t-4 border-red-600">

            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg pulse-glow">
                  <Calculator className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
                    Shipping Dimensions Calculator
                  </h1>
                  <p className="text-sm text-neutral-500 font-medium">Coil · Sheet · Plate · Extrusion</p>
                </div>
              </div>
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 font-semibold text-sm"
              >
                <Trash2 className="w-4 h-4" />Clear All
              </button>
            </div>

            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-neutral-300 w-fit text-xs font-bold mb-5">
              <button
                onClick={() => setMode("coil")}
                className={`px-6 py-2.5 transition-colors ${mode === "coil" ? "bg-neutral-800 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}
              >COIL</button>
              <button
                onClick={() => setMode("sheet")}
                className={`px-6 py-2.5 transition-colors border-l border-neutral-300 ${mode === "sheet" ? "bg-red-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}
              >SHEET / PLATE</button>
              <button
                onClick={() => setMode("ext")}
                className={`px-6 py-2.5 transition-colors border-l border-neutral-300 ${mode === "ext" ? "bg-red-700 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}
              >EXTRUSION</button>
            </div>

            {/* ── COIL INPUTS ── */}
            {mode === "coil" && (
              <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-xl p-4 border border-neutral-200">
                <h2 className="text-sm font-bold mb-3 text-neutral-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>Coil Parameters
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Alloy</label>
                    <select value={coilIn.alloy} onChange={e => setC("alloy")(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium">
                      {ALLOYS.map(a => <option key={a.label} value={a.label}>{a.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Core I.D."</label>
                    <select value={coilIn.coreId} onChange={e => setC("coreId")(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium">
                      <option value="16">16"</option>
                      <option value="20">20"</option>
                      <option value="24">24"</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-500">Density</label>
                    <input readOnly value={getDensity(coilIn.alloy)}
                      className="w-full px-3 py-2 text-sm border-2 border-neutral-400 rounded-lg bg-neutral-100 font-bold text-neutral-800 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Thickness"</label>
                    <input type="number" step="0.001" value={coilIn.thickness}
                      onChange={e => setC("thickness")(e.target.value)} onKeyDown={coilKey} placeholder="0.032"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Width"</label>
                    <input type="number" step="0.1" value={coilIn.width}
                      onChange={e => setC("width")(e.target.value)} onKeyDown={coilKey} placeholder="48"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Weight (lbs/coil)</label>
                    <input type="number" step="1" value={coilIn.weight}
                      onChange={e => setC("weight")(e.target.value)} onKeyDown={coilKey} placeholder="6076"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                </div>

                {/* Stacking controls */}
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Coils / Skid Mode</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-300 w-fit text-xs font-bold">
                      <button type="button" onClick={() => setC("autoCoils")(true)}
                        className={`px-4 py-2 transition-colors ${coilIn.autoCoils ? "bg-red-700 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                        AUTO-FIT
                      </button>
                      <button type="button" onClick={() => setC("autoCoils")(false)}
                        className={`px-4 py-2 transition-colors border-l border-neutral-300 ${!coilIn.autoCoils ? "bg-neutral-800 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                        MANUAL
                      </button>
                    </div>
                  </div>

                  <div className="sm:max-w-[120px]">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Coils / Skid</label>
                    <input type="number" step="1" min="1"
                      value={coilIn.autoCoils ? (liveCoilCount ? liveCoilCount.n : "") : coilIn.coilsPerSkid}
                      readOnly={coilIn.autoCoils}
                      onChange={e => setC("coilsPerSkid")(e.target.value)} onKeyDown={coilKey} placeholder="1"
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-red-500 font-medium ${coilIn.autoCoils ? "border-neutral-400 bg-neutral-100 text-neutral-800 cursor-not-allowed font-bold" : "border-neutral-300 bg-white"}`} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Stacking Orientation</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-300 w-fit text-xs font-bold">
                      <button type="button" onClick={() => setC("stackOrient")("side")}
                        className={`px-4 py-2 transition-colors ${coilIn.stackOrient === "side" ? "bg-neutral-800 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                        EYE TO SIDE
                      </button>
                      <button type="button" onClick={() => setC("stackOrient")("sky")}
                        className={`px-4 py-2 transition-colors border-l border-neutral-300 ${coilIn.stackOrient === "sky" ? "bg-red-700 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                        EYE TO SKY
                      </button>
                    </div>
                  </div>

                  {coilIn.autoCoils && (
                    <>
                      <div className="sm:max-w-[140px]">
                        <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Max Skid Wt (lbs)</label>
                        <input type="number" step="100" value={coilIn.maxSkidWt}
                          onChange={e => setC("maxSkidWt")(e.target.value)} onKeyDown={coilKey} placeholder="5000"
                          className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                      </div>
                      {coilIn.stackOrient === "sky" ? (
                        <div className="sm:max-w-[140px]">
                          <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Max Stack Ht (in)</label>
                          <input type="number" step="1" value={coilIn.maxStackH}
                            onChange={e => setC("maxStackH")(e.target.value)} onKeyDown={coilKey} placeholder="72"
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                        </div>
                      ) : (
                        <div className="sm:max-w-[140px]">
                          <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Max Row Len (in)</label>
                          <input type="number" step="1" value={coilIn.maxRowLen}
                            onChange={e => setC("maxRowLen")(e.target.value)} onKeyDown={coilKey} placeholder="96"
                            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Live count hint */}
                <div className="mt-2 text-xs">
                  {coilNarrow && (
                    <span className="inline-block mr-3 px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold border border-red-200">
                      Narrow coil (under {coilIn.coreId}" core) - good candidate for multiple per skid
                    </span>
                  )}
                  {coilIn.autoCoils && liveCoilCount && (
                    <span className="text-neutral-500">
                      Fits <span className="font-bold text-neutral-800">{liveCoilCount.n}</span> coil{liveCoilCount.n === 1 ? "" : "s"}/skid
                      {" "}({liveCoilCount.limit === "weight" ? `weight cap ${(parseFloat(coilIn.maxSkidWt) || 0).toLocaleString()} lbs` : `${liveCoilCount.limit} cap`})
                      {" "}= <span className="font-bold text-neutral-800">{(liveCoilGeom.lbs * liveCoilCount.n).toLocaleString()} lbs</span> total
                    </span>
                  )}
                  {!coilIn.autoCoils && (
                    <span className="text-neutral-400">
                      {coilIn.stackOrient === "sky"
                        ? "Eye to sky: coils laid flat, stacked. Height = coils x width."
                        : "Eye to side: coils stood in a saddle, lined up side by side. Height = OD."}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={doCoilCalc}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 font-semibold text-sm shadow-lg">
                    CALCULATE ▸
                  </button>
                  <p className="text-xs text-neutral-400">or press Enter in any field</p>
                </div>
                {coilResult?.error && (
                  <div className="mt-3 flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 font-semibold">{coilResult.error}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── SHEET / PLATE INPUTS ── */}
            {mode === "sheet" && (
              <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-xl p-4 border border-neutral-200">
                <h2 className="text-sm font-bold mb-3 text-neutral-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-neutral-600"></span>Sheet / Plate Parameters
                </h2>

                {/* Row 1: alloy, density, thickness, width, length */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Alloy</label>
                    <select value={sheetIn.alloy} onChange={e => updateSheet("alloy", e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium">
                      {ALLOYS.map(a => <option key={a.label} value={a.label}>{a.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-500">Density</label>
                    <input readOnly value={getDensity(sheetIn.alloy)}
                      className="w-full px-3 py-2 text-sm border-2 border-neutral-400 rounded-lg bg-neutral-100 font-bold text-neutral-800 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Thickness"</label>
                    <input type="number" step="0.001" value={sheetIn.thickness}
                      onChange={e => updateSheet("thickness", e.target.value)} onKeyDown={sheetKey} placeholder="0.250"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Width"</label>
                    <input type="number" step="0.1" value={sheetIn.width}
                      onChange={e => updateSheet("width", e.target.value)} onKeyDown={sheetKey} placeholder="48"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Length"</label>
                    <input type="number" step="0.1" value={sheetIn.length}
                      onChange={e => updateSheet("length", e.target.value)} onKeyDown={sheetKey} placeholder="144"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                </div>

                {/* Row 2: Qty and Total Lbs linked pair */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-0 sm:gap-0 w-full sm:w-auto">
                  <div className="flex-1 sm:max-w-[160px]">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Qty (pcs)</label>
                    <input
                      type="number" step="1" value={sheetIn.qty}
                      onChange={e => updateSheet("qty", e.target.value)}
                      onKeyDown={sheetKey} placeholder="5"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 focus:ring-2 focus:ring-red-500 bg-white font-medium border-r-0"
                      style={{ borderRadius: "0.5rem 0 0 0.5rem" }}
                    />
                  </div>
                  <div className="flex items-end">
                    <div
                      className="flex flex-col items-center justify-center px-2.5 bg-neutral-200 border-y border-neutral-300 text-neutral-500 font-bold"
                      style={{ height: "38px", fontSize: "11px", lineHeight: 1, minWidth: "36px" }}
                    >
                      <span style={{ fontSize: "13px", lineHeight: 1 }}>⇄</span>
                      <span style={{ fontSize: "9px", marginTop: "2px", letterSpacing: "0.04em" }}>OR</span>
                    </div>
                  </div>
                  <div className="flex-1 sm:max-w-[200px]">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">
                      Total Weight (lbs)
                      {liveWtPerPc && (
                        <span className="ml-2 text-neutral-400 font-normal normal-case">
                          {fmtN(liveWtPerPc, 2)} lbs/pc
                        </span>
                      )}
                    </label>
                    <input
                      type="number" step="1" value={sheetIn.totalWt}
                      onChange={e => updateSheet("totalWt", e.target.value)}
                      onKeyDown={sheetKey} placeholder="e.g. 3500"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 focus:ring-2 focus:ring-red-500 bg-white font-medium border-l-0"
                      style={{ borderRadius: "0 0.5rem 0.5rem 0" }}
                    />
                  </div>
                  <div className="hidden sm:block flex-1" />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={doSheetCalc}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 font-semibold text-sm shadow-lg">
                    CALCULATE ▸
                  </button>
                  <p className="text-xs text-neutral-400">or press Enter in any field</p>
                </div>
              </div>
            )}

            {/* ── EXTRUSION INPUTS ── */}
            {mode === "ext" && (
              <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-xl p-4 border border-neutral-200">
                <h2 className="text-sm font-bold mb-3 text-neutral-700 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-700"></span>Extrusion Parameters
                </h2>

                {/* Row 1: alloy, density, shape, then dynamic size fields */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Alloy</label>
                    <select value={extIn.alloy} onChange={e => updateExt("alloy", e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium">
                      {ALLOYS.map(a => <option key={a.label} value={a.label}>{a.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-500">Density</label>
                    <input readOnly value={getDensity(extIn.alloy)}
                      className="w-full px-3 py-2 text-sm border-2 border-neutral-400 rounded-lg bg-neutral-100 font-bold text-neutral-800 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Shape</label>
                    <select value={extIn.shape} onChange={e => updateExt("shape", e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium">
                      {EXT_SHAPES.map(sh => <option key={sh.key} value={sh.key}>{sh.label}</option>)}
                    </select>
                  </div>
                  {extShapeCfg.fields.map(([k, lbl]) => (
                    <div key={k}>
                      <label className="block text-xs font-semibold mb-1.5 text-neutral-600">{lbl}</label>
                      <input type="number" step="0.001" value={extIn[k]}
                        onChange={e => updateExt(k, e.target.value)} onKeyDown={extKey}
                        placeholder={k === "lbPerFt" ? "0.750" : "0.0"}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                    </div>
                  ))}
                </div>

                {/* Derived profile readout */}
                {liveExtProfile && (
                  <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-500">
                    <span><span className="font-semibold text-neutral-700">Wt/ft:</span> {liveExtProfile.lbPerFt.toFixed(3)} lb/ft</span>
                    <span><span className="font-semibold text-neutral-700">X-sec:</span> {liveExtProfile.area.toFixed(3)} in²</span>
                    <span><span className="font-semibold text-neutral-700">Piece:</span> {fmtN(liveExtProfile.pieceW, 2)}" x {fmtN(liveExtProfile.pieceH, 2)}"</span>
                  </div>
                )}

                {/* Row 2: Length + unit toggle */}
                <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-3">
                  <div className="sm:max-w-[200px]">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">
                      Length ({extIn.lengthUnit === "ft" ? "ft" : "in"})
                    </label>
                    <input type="number" step={extIn.lengthUnit === "ft" ? "0.5" : "1"} value={extIn.length}
                      onChange={e => updateExt("length", e.target.value)} onKeyDown={extKey}
                      placeholder={extIn.lengthUnit === "ft" ? "20" : "240"}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Unit</label>
                    <div className="flex rounded-lg overflow-hidden border border-neutral-300 w-fit text-xs font-bold">
                      <button type="button" onClick={() => setExtUnit("in")}
                        className={`px-4 py-2 transition-colors ${extIn.lengthUnit === "in" ? "bg-neutral-800 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                        IN
                      </button>
                      <button type="button" onClick={() => setExtUnit("ft")}
                        className={`px-4 py-2 transition-colors border-l border-neutral-300 ${extIn.lengthUnit === "ft" ? "bg-red-700 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}>
                        FT
                      </button>
                    </div>
                  </div>
                  {liveExtWtPerPc && (
                    <p className="text-xs text-neutral-400 sm:pb-2">{fmtN(liveExtWtPerPc, 2)} lbs/pc at this length</p>
                  )}
                </div>

                {/* Row 3: Qty and Total Lbs linked pair */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-0 sm:gap-0 w-full sm:w-auto">
                  <div className="flex-1 sm:max-w-[160px]">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Qty (pcs)</label>
                    <input
                      type="number" step="1" value={extIn.qty}
                      onChange={e => updateExt("qty", e.target.value)}
                      onKeyDown={extKey} placeholder="100"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 focus:ring-2 focus:ring-red-500 bg-white font-medium border-r-0"
                      style={{ borderRadius: "0.5rem 0 0 0.5rem" }}
                    />
                  </div>
                  <div className="flex items-end">
                    <div
                      className="flex flex-col items-center justify-center px-2.5 bg-neutral-200 border-y border-neutral-300 text-neutral-500 font-bold"
                      style={{ height: "38px", fontSize: "11px", lineHeight: 1, minWidth: "36px" }}
                    >
                      <span style={{ fontSize: "13px", lineHeight: 1 }}>⇄</span>
                      <span style={{ fontSize: "9px", marginTop: "2px", letterSpacing: "0.04em" }}>OR</span>
                    </div>
                  </div>
                  <div className="flex-1 sm:max-w-[200px]">
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">
                      Total Weight (lbs)
                      {liveExtWtPerPc && (
                        <span className="ml-2 text-neutral-400 font-normal normal-case">
                          {fmtN(liveExtWtPerPc, 2)} lbs/pc
                        </span>
                      )}
                    </label>
                    <input
                      type="number" step="1" value={extIn.totalWt}
                      onChange={e => updateExt("totalWt", e.target.value)}
                      onKeyDown={extKey} placeholder="e.g. 1500"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 focus:ring-2 focus:ring-red-500 bg-white font-medium border-l-0"
                      style={{ borderRadius: "0 0.5rem 0.5rem 0" }}
                    />
                  </div>
                  <div className="hidden sm:block flex-1" />
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button onClick={doExtCalc}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 font-semibold text-sm shadow-lg">
                    CALCULATE ▸
                  </button>
                  <p className="text-xs text-neutral-400">Pick the shape and size, then pcs or total weight. Bundle footprint is estimated from piece size.</p>
                </div>
              </div>
            )}

          </div>{/* end glass-card */}

          {/* ── RESULT DETAIL CARDS ── */}
          {mode === "coil"  && coilResult  && !coilResult.error  && <CoilDetail      result={coilResult}  inputs={coilIn}  />}
          {mode === "sheet" && sheetResult && <SheetDetail      result={sheetResult} inputs={sheetIn} />}
          {mode === "ext"   && extResult   && <ExtrusionDetail  result={extResult}   inputs={extIn}   />}

          {/* ── TECHNICAL REFERENCE ── */}
          <TechRef />

          <p className="text-center text-xs text-neutral-600 pb-4">
            Erin Morgan — Ext. 289 &nbsp;|&nbsp; Densities: ASTM B209
          </p>
        </div>
      </div>
    </>
  );
}
