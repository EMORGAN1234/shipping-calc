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

// Returns lbs/piece given an extrusion state object — null if inputs incomplete
const computeExtWtPerPc = s => {
  const lpf = parseFloat(s.lbPerFt), Lft = parseFloat(s.length);
  if (!lpf || !Lft || lpf <= 0 || Lft <= 0) return null;
  return lpf * Lft;
};

// ── CALC: COIL ────────────────────────────────────────────────────────────────
function calcCoil({ alloy, thickness, width, weight, coreId }) {
  const density = getDensity(alloy);
  const t = parseFloat(thickness), w = parseFloat(width);
  const lbs = parseFloat(weight), id = parseFloat(coreId);
  if (!t || !w || !lbs || !id || t <= 0 || w <= 0 || lbs <= 0 || id <= 0) return null;
  const volIn3   = lbs / density;
  const lengthIn = volIn3 / (t * w);
  const lengthFt = lengthIn / 12;
  const od       = Math.sqrt((4 * lengthIn * t) / Math.PI + id * id);
  if (od <= id) return { error: "Calculated OD <= Core ID - check gauge, width, or weight." };
  const skidLen  = Math.ceil((w + 4) / 2) * 2;
  const skidWid  = getSaddleWidth(od);
  const skidH    = 6;
  const totalH   = od + skidH;
  const prodType = getProductType(t);
  const flags = [];
  if (od > 72)      flags.push({ level: "warn",   msg: `OD ${fmtN(od)}" exceeds 72"  -  verify skid/saddle load rating and coil handling equipment` });
  else if (od > 60) flags.push({ level: "info",   msg: `Large OD (${fmtN(od)}")  -  confirm saddle and handling equipment are rated for this diameter` });
  if (totalH > 96)       flags.push({ level: "danger", msg: `Stack height ${fmtN(totalH)}" >96"  -  specialized freight or open-top trailer may be required` });
  else if (totalH > 72)  flags.push({ level: "warn",   msg: `Stack height ${fmtN(totalH)}"  -  verify dock door height and warehouse rack clearance` });
  if (lbs > 20000)      flags.push({ level: "danger", msg: `Coil weight ${lbs.toLocaleString()} lbs >20,000  -  heavy-lift equipment required` });
  else if (lbs > 15000) flags.push({ level: "warn",   msg: `Coil weight ${lbs.toLocaleString()} lbs  -  verify forklift rated capacity` });
  if (lengthFt > 8000) flags.push({ level: "info", msg: `Very long coil (${Math.round(lengthFt).toLocaleString()} ft)  -  confirm weld count with supplier` });
  return {
    density, volIn3: Math.round(volIn3),
    lengthIn: Math.round(lengthIn), lengthFt: Math.round(lengthFt),
    od: fmtN(od), skidLen, skidWid, skidH,
    totalH: fmtN(totalH), prodType, flags,
  };
}

// ── CALC: SHEET / PLATE ───────────────────────────────────────────────────────
function calcSheet({ alloy, thickness, width, length, qty, maxStackH, maxSkidWt }) {
  const density = getDensity(alloy);
  const t = parseFloat(thickness), w = parseFloat(width);
  const l = parseFloat(length),    q = parseInt(qty);
  if (!t || !w || !l || !q || t <= 0 || w <= 0 || l <= 0 || q <= 0) return null;
  const wtPerPc  = l * w * t * density;
  const totalWt  = wtPerPc * q;

  // Realistic packing: a single skid is capped by product stack height and by
  // weight. Split the order across as many skids as needed rather than piling the
  // whole quantity into one impossible column.
  const DUNNAGE = 1.0, SKID_BASE = 5.5, INTERLEAVE = 0.004;
  const maxH = parseFloat(maxStackH) > 0 ? parseFloat(maxStackH) : 40;    // product stack cap, in
  const maxW = parseFloat(maxSkidWt) > 0 ? parseFloat(maxSkidWt) : 4000;  // weight cap per skid, lb
  const perPc     = t + INTERLEAVE;
  const byHeight  = Math.max(1, Math.floor((maxH + INTERLEAVE) / perPc)); // pcs that fit under height cap
  const byWeight  = Math.max(1, Math.floor(maxW / wtPerPc));              // pcs that fit under weight cap
  const perSkid   = Math.max(1, Math.min(byHeight, byWeight, q));
  const skidCount = Math.ceil(q / perSkid);
  const lastPcs   = q - perSkid * (skidCount - 1);
  const binding   = perSkid >= q ? "single" : (byHeight <= byWeight ? "height" : "weight");

  // Dimensions reported for a full skid
  const fullPcs  = Math.min(perSkid, q);
  const stackThk = fullPcs * t + Math.max(0, fullPcs - 1) * INTERLEAVE;
  const totalH   = stackThk + DUNNAGE + SKID_BASE;
  const skidWt   = fullPcs * wtPerPc;
  const skidLen  = l + 4;
  const skidWid  = w + 4;
  const prodType = getProductType(t);

  const flags = [];
  if (skidCount > 1)
    flags.push({ level: "info", msg: `Order splits across ${skidCount} skids at ${perSkid} pcs each (${binding === "height" ? "stack-height limited" : "weight limited"}); last skid carries ${lastPcs} pc${lastPcs === 1 ? "" : "s"}` });
  if (prodType === "PLATE") flags.push({ level: "info", msg: `Plate classification (>= .250")  -  edge/corner protection recommended in transit` });
  if (wtPerPc > 500)       flags.push({ level: "warn",   msg: `Individual piece ${fmtN(wtPerPc, 0)} lbs  -  mechanical handling required` });
  else if (wtPerPc > 300)  flags.push({ level: "info",   msg: `Individual piece ${fmtN(wtPerPc, 0)} lbs  -  mechanical assist recommended` });
  if (skidWt > 6000)       flags.push({ level: "danger", msg: `Skid weight ${fmtN(skidWt, 0)} lbs  -  heavy-lift required; lower the max skid weight to split further` });
  else if (skidWt > 4000)  flags.push({ level: "warn",   msg: `Skid weight ${fmtN(skidWt, 0)} lbs  -  verify forklift capacity` });
  if (skidLen > 240) flags.push({ level: "danger", msg: `Skid length ${skidLen}"  -  flatbed or specialized freight likely required` });
  else if (l > 192)  flags.push({ level: "warn",   msg: `Sheet length ${l}"  -  verify dock/trailer clearance for unloading` });
  return {
    density, wtPerPc: wtPerPc.toFixed(1), totalWt: totalWt.toFixed(1),
    perSkid, skidCount, lastPcs, binding, fullPcs,
    stackThk: stackThk.toFixed(3), totalH: totalH.toFixed(1),
    skidWt: skidWt.toFixed(1),
    skidLen: skidLen.toFixed(0), skidWid: skidWid.toFixed(0),
    skidH: SKID_BASE, prodType, flags,
  };
}

// ── CALC: EXTRUSION ───────────────────────────────────────────────────────────
function calcExtrusion({ alloy, lbPerFt, length, qty, bundleW, bundleH }) {
  const density = getDensity(alloy);
  const lpf = parseFloat(lbPerFt), Lft = parseFloat(length), q = parseInt(qty);
  const bw  = parseFloat(bundleW), bh = parseFloat(bundleH);
  if (!lpf || !Lft || !q || lpf <= 0 || Lft <= 0 || q <= 0) return null;
  const wtPerPc  = lpf * Lft;
  const totalWt  = wtPerPc * q;
  const lengthIn = Lft * 12;
  const xArea    = lpf / (density * 12);       // cross-sectional metal area, in² per pc

  // Bundle cross-section. Weight per ft only gives the metal area of one piece, not
  // the profile's outer W x H, so a true footprint needs the banded bundle size.
  // If either dimension is left blank, estimate it from the bundle's total metal
  // area and a typical banded packing efficiency (extrusions bundle loose, with
  // voids). The estimate scales with qty and profile size, then the user can refine.
  const PACK_EFF    = 0.35;                     // ~35% of the bundle envelope is metal
  const envelopeIn2 = (q * xArea) / PACK_EFF;   // estimated bundle bounding-box area
  const haveW = bw && bw > 0;
  const haveH = bh && bh > 0;
  let bundW, bundH, estW = false, estH = false;
  if (haveW && haveH)      { bundW = bw; bundH = bh; }
  else if (haveW)          { bundW = bw; bundH = envelopeIn2 / bw; estH = true; }
  else if (haveH)          { bundH = bh; bundW = envelopeIn2 / bh; estW = true; }
  else                     { bundW = bundH = Math.sqrt(envelopeIn2); estW = estH = true; } // square bundle
  const estimated = estW || estH;

  const bunkH    = 4;                           // dunnage / bunks under the bundle
  const totalH   = bundH + bunkH;
  const skidLen  = lengthIn;                    // bunks span the load length
  const footW    = bundW;

  const flags = [];
  if (lengthIn > 288)      flags.push({ level: "warn", msg: `Stock length ${fmtN(Lft, 0)} ft (${lengthIn}")  -  flatbed or 53' trailer required; verify overhang and side-load access` });
  else if (lengthIn > 240) flags.push({ level: "info", msg: `Long stock ${fmtN(Lft, 0)} ft  -  confirm trailer length and dock clearance for unloading` });
  if (totalWt > 20000)     flags.push({ level: "danger", msg: `Bundle total >20,000 lbs  -  heavy-lift equipment required` });
  else if (totalWt > 4000) flags.push({ level: "warn",   msg: `Bundle total ${fmtN(totalWt, 0)} lbs  -  verify forklift capacity` });
  if (wtPerPc > 300)       flags.push({ level: "info", msg: `Heavy single length ${fmtN(wtPerPc, 0)} lbs/pc  -  mechanical handling recommended` });
  if (estimated)           flags.push({ level: "info", msg: `Bundle cross-section ESTIMATED at ${fmtN(bundW, 0)}" x ${fmtN(bundH, 0)}" from ${q} pcs of ${xArea.toFixed(3)} in metal at ${Math.round(PACK_EFF * 100)}% packing  -  weight per ft does not carry the profile shape, so enter the actual banded W x H for an exact footprint` });

  return {
    density, wtPerPc: wtPerPc.toFixed(1), totalWt: totalWt.toFixed(1),
    lengthIn, lengthFt: Lft,
    bundW: fmtN(bundW, 1), bundH: fmtN(bundH, 1), bunkH, totalH: totalH.toFixed(1),
    skidLen: skidLen.toFixed(0), footW: fmtN(footW, 1), xArea: xArea.toFixed(3),
    estimated, estW, estH, prodType: "EXTRUSION", flags,
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
  const lbs        = parseFloat(inputs.weight);
  const totalHNum  = parseFloat(result.totalH);
  const heightOk   = totalHNum <= 72;
  const heightWarn = totalHNum > 72 && totalHNum <= 96;

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white px-5 py-4">
        <h2 className="text-lg font-bold tracking-wide flex items-center gap-3">
          Shipping Dimensions — Coil
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-600 text-white border border-neutral-500">
            {result.prodType}
          </span>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          {inputs.alloy} @ {inputs.thickness}" | {inputs.width}" wide | {lbs.toLocaleString()} lbs | {inputs.coreId}" core | Density: {result.density} lb/in³
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
            <p className="text-sm font-medium text-neutral-600">Skid Length (axis)</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.skidLen}"</p>
            <p className="text-xs text-neutral-400 mb-2">coil width + 2" each end</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Saddle Width:</span> <span className="font-bold">{result.skidWid}"</span></p>
            <p className="text-xs text-neutral-400">scales to OD</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Skid Height:</span> <span className="font-bold">{result.skidH}"</span></p>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Total Stack Height</p>
            <p className="text-3xl font-extrabold text-neutral-900">{result.totalH}"</p>
            <p className="text-xs text-neutral-400 mb-2">eye to sky</p>
            <div className="pt-1 border-t border-neutral-200 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">OD</span>
                <span className="font-bold text-neutral-700">{result.od}"</span>
              </div>
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
            <p className="text-sm"><span className="font-medium text-neutral-600">Footprint:</span> <span className="font-bold">{result.skidLen}" × {result.skidWid}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Height:</span> <span className="font-bold">{result.totalH}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Coil Weight:</span> <span className="font-bold">{lbs.toLocaleString()} lbs</span></p>
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
            Skid: {result.skidLen}" L × {result.skidWid}" W × {result.skidH}" H |
            <span className="text-amber-400">Total Height: {result.totalH}"</span> | {lbs.toLocaleString()} lbs
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
              <p className="text-sm"><span className="font-medium text-neutral-600">Skids:</span> <span className="font-bold">{result.skidCount} @ {result.perSkid} pcs{result.skidCount > 1 ? ` (last: ${result.lastPcs})` : ""}</span></p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Stack Profile</p>
            <p className="text-3xl font-extrabold text-neutral-900">{result.totalH}"</p>
            <p className="text-xs text-neutral-400 mb-2">height per skid{result.skidCount > 1 ? ` · ${result.skidCount} skids` : ""}</p>
            <div className="pt-1 border-t border-neutral-200 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-500">{result.fullPcs} × {inputs.thickness}" + interleave</span>
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
                <span className="font-bold text-neutral-800">= Per Skid</span>
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
            <p className="text-xs text-neutral-400 mt-1">per skid ({result.skidCount} total)</p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200">
            <p className="font-bold text-amber-700 mb-2 text-sm uppercase tracking-wide">📦 Freight Profile</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Skid (each):</span> <span className="font-bold">{result.skidLen}" × {result.skidWid}" × {result.totalH}"</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Skid Count:</span> <span className="font-bold text-red-700">{result.skidCount}</span> <span className="text-neutral-500">@ {parseFloat(result.skidWt).toLocaleString()} lbs</span></p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Order Total:</span> <span className="font-bold">{parseFloat(result.totalWt).toLocaleString()} lbs</span></p>
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
            <span className="text-red-400">{result.skidCount} skid{result.skidCount === 1 ? "" : "s"}</span> @ {result.skidLen}" × {result.skidWid}" |
            <span className="text-amber-400">Skid Height: {result.totalH}"</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── EXTRUSION DETAIL CARD ─────────────────────────────────────────────────────
function ExtrusionDetail({ result, inputs }) {
  const q       = parseInt(inputs.qty);
  const lenIn   = result.lengthIn;
  const lenOk   = lenIn <= 240;
  const lenWarn = lenIn > 240 && lenIn <= 288;

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white px-5 py-4">
        <h2 className="text-lg font-bold tracking-wide flex items-center gap-3">
          Shipping Dimensions — Extrusion
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-neutral-600 text-white border border-neutral-500">
            {result.prodType}
          </span>
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          {inputs.alloy} @ {inputs.lbPerFt} lb/ft | {fmtN(result.lengthFt, 0)} ft lengths | {q} {q === 1 ? "pc" : "pcs"} | X-sec: {result.xArea} in² | Density: {result.density} lb/in³
        </p>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Piece / Bundle</p>
            <p className="text-sm font-medium text-neutral-600">Weight / Piece</p>
            <p className="text-2xl font-extrabold text-neutral-900">{parseFloat(result.wtPerPc).toLocaleString()} lbs</p>
            <div className="mt-2 pt-2 border-t border-neutral-200 space-y-0.5">
              <p className="text-sm"><span className="font-medium text-neutral-600">Length:</span> <span className="font-bold">{fmtN(result.lengthFt, 0)} ft ({result.lengthIn.toLocaleString()}")</span></p>
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
                <span className="text-neutral-500">Bundle Height{result.estH ? " (est)" : ""}</span>
                <span className={`font-bold ${result.estH ? "text-amber-700" : "text-neutral-700"}`}>{result.bundH}"</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Bundle Width{result.estW ? " (est)" : ""}</span>
                <span className={`font-bold ${result.estW ? "text-amber-700" : "text-neutral-700"}`}>{result.bundW}"</span>
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
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Skid Footprint</p>
            <p className="text-sm font-medium text-neutral-600">Bunk Length</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.skidLen}"</p>
            <p className="text-xs text-neutral-400 mb-2">spans full stock length</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Bundle Width:</span> <span className={`font-bold ${result.estW ? "text-amber-700" : ""}`}>{result.footW}"</span></p>
            <p className="text-xs text-neutral-400">{result.estimated ? "estimated cross-section" : "banded cross-section"}</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Bunk Height:</span> <span className="font-bold">{result.bunkH}"</span></p>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200">
            <p className="font-bold text-amber-700 mb-2 text-sm uppercase tracking-wide">📦 Freight Profile</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Footprint:</span> <span className="font-bold">{result.skidLen}" × {result.footW}"{result.estimated ? " est" : ""}</span></p>
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
            {inputs.alloy} @ {inputs.lbPerFt} lb/ft | {fmtN(result.lengthFt, 0)} ft × {q} pcs |
            {parseFloat(result.totalWt).toLocaleString()} lbs |
            Bundle: {result.skidLen}" L × {result.footW}" W |
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
                <p><span className="font-bold text-neutral-800">Stack Height:</span> OD + 6" skid</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">
                  <span className="font-bold text-neutral-800">Saddle width</span> scales with OD — widens for large coils to maintain stability.
                </p>
              </div>
            </div>
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Sheet / Plate Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Wt/Pc:</span> L x W x t x Density</p>
                <p><span className="font-bold text-neutral-800">Pcs/Skid:</span> capped by Max Stack Ht and Max Skid Wt, whichever binds first</p>
                <p><span className="font-bold text-neutral-800">Skids:</span> ceil(Qty / Pcs-per-Skid)</p>
                <p><span className="font-bold text-neutral-800">Stack:</span> Pcs-per-Skid x Gauge + interleave (0.004" kraft)</p>
                <p><span className="font-bold text-neutral-800">Total H:</span> Stack + 1.0" dunnage + 5.5" skid</p>
                <p><span className="font-bold text-neutral-800">Skid L:</span> Sheet Length + 4"</p>
                <p><span className="font-bold text-neutral-800">Skid W:</span> Sheet Width + 4"</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">Plate &gt;= .250" per ASTM B209. Sheet &lt;= .249".</p>
              </div>
            </div>
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Extrusion Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Wt/Pc:</span> Wt-per-ft x Length(ft)</p>
                <p><span className="font-bold text-neutral-800">Total Wt:</span> Wt/Pc x Qty</p>
                <p><span className="font-bold text-neutral-800">X-Sec Area:</span> Wt-per-ft / (Density x 12) — derived in²</p>
                <p><span className="font-bold text-neutral-800">Footprint:</span> Length x Bundle Width</p>
                <p><span className="font-bold text-neutral-800">Total H:</span> Bundle Height + 4" bunks</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">Bundle W x H are optional. If blank, the bundle envelope is estimated from Qty x metal area at ~35% packing. Weight per ft does not carry the profile shape, so enter actual banded W x H for an exact footprint.</p>
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
  });
  const [coilResult, setCoilResult] = useState(null);

  const [sheetIn, setSheetIn] = useState({
    alloy: "5052", thickness: "", width: "", length: "", qty: "", totalWt: "", maxStackH: "", maxSkidWt: "",
  });
  const [sheetResult, setSheetResult] = useState(null);

  const [extIn, setExtIn] = useState({
    alloy: "6063", lbPerFt: "", length: "", qty: "", totalWt: "", bundleW: "", bundleH: "",
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
          // Dimension changed — qty takes priority as source of truth
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
        } else if (key === "lbPerFt" || key === "length") {
          // Driver changed — qty takes priority as source of truth
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

  const setC = key => val => setCoilIn(p => ({ ...p, [key]: val }));

  const doCoilCalc  = () => setCoilResult(calcCoil(coilIn));
  const doSheetCalc = () => setSheetResult(calcSheet(sheetIn));
  const doExtCalc   = () => setExtResult(calcExtrusion(extIn));
  const coilKey     = e => { if (e.key === "Enter") doCoilCalc(); };
  const sheetKey    = e => { if (e.key === "Enter") doSheetCalc(); };
  const extKey      = e => { if (e.key === "Enter") doExtCalc(); };

  const handleClear = () => {
    setCoilIn({ alloy: "5052", thickness: "", width: "", weight: "", coreId: "20" });
    setSheetIn({ alloy: "5052", thickness: "", width: "", length: "", qty: "", totalWt: "", maxStackH: "", maxSkidWt: "" });
    setExtIn({ alloy: "6063", lbPerFt: "", length: "", qty: "", totalWt: "", bundleW: "", bundleH: "" });
    setCoilResult(null);
    setSheetResult(null);
    setExtResult(null);
  };

  const liveWtPerPc    = computeWtPerPc(sheetIn);
  const liveExtWtPerPc = computeExtWtPerPc(extIn);
  const liveExtArea    = (() => {
    const lpf = parseFloat(extIn.lbPerFt), d = getDensity(extIn.alloy);
    if (!lpf || lpf <= 0) return null;
    return lpf / (d * 12);
  })();

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
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Weight (lbs)</label>
                    <input type="number" step="1" value={coilIn.weight}
                      onChange={e => setC("weight")(e.target.value)} onKeyDown={coilKey} placeholder="6076"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
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

                {/* Row 3: per-skid caps */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Max Stack Ht (in)</label>
                    <input type="number" step="1" value={sheetIn.maxStackH}
                      onChange={e => updateSheet("maxStackH", e.target.value)} onKeyDown={sheetKey} placeholder="40"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Max Skid Wt (lb)</label>
                    <input type="number" step="100" value={sheetIn.maxSkidWt}
                      onChange={e => updateSheet("maxSkidWt", e.target.value)} onKeyDown={sheetKey} placeholder="4000"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div className="col-span-2 flex items-end">
                    <p className="text-xs text-neutral-400 pb-2">Caps split the order across skids. Defaults: 40" stack, 4,000 lb/skid.</p>
                  </div>
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

                {/* Row 1: alloy, density, wt/ft, length, bundle W, bundle H */}
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
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">
                      Weight / ft
                      {liveExtArea && (
                        <span className="ml-1 text-neutral-400 font-normal normal-case">
                          {fmtN(liveExtArea, 3)} in²
                        </span>
                      )}
                    </label>
                    <input type="number" step="0.001" value={extIn.lbPerFt}
                      onChange={e => updateExt("lbPerFt", e.target.value)} onKeyDown={extKey} placeholder="0.750"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Length (ft)</label>
                    <input type="number" step="0.5" value={extIn.length}
                      onChange={e => updateExt("length", e.target.value)} onKeyDown={extKey} placeholder="20"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Bundle W"</label>
                    <input type="number" step="0.5" value={extIn.bundleW}
                      onChange={e => updateExt("bundleW", e.target.value)} onKeyDown={extKey} placeholder="12"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Bundle H"</label>
                    <input type="number" step="0.5" value={extIn.bundleH}
                      onChange={e => updateExt("bundleH", e.target.value)} onKeyDown={extKey} placeholder="12"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                </div>

                {/* Row 2: Qty and Total Lbs linked pair */}
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
                  <p className="text-xs text-neutral-400">weight/ft from the order. Bundle W x H optional - estimated from piece count if blank.</p>
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
