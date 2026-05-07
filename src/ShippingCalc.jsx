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
  if (od <= id) return { error: "Calculated OD ≤ Core ID — check gauge, width, or weight." };
  const skidLen  = Math.ceil((w + 4) / 2) * 2;
  const skidWid  = getSaddleWidth(od);
  const skidH    = 6;
  const totalH   = od + skidH;
  const prodType = getProductType(t);
  // else-if per category — only the highest-severity condition fires for each concern
  const flags = [];
  // OD diameter
  if (od > 72)      flags.push({ level: "warn",   msg: `OD ${fmtN(od)}" exceeds 72"  —  verify skid/saddle load rating and coil handling equipment` });
  else if (od > 60) flags.push({ level: "info",   msg: `Large OD (${fmtN(od)}")  —  confirm saddle and handling equipment are rated for this diameter` });
  // Stack height
  if (totalH > 96)       flags.push({ level: "danger", msg: `Stack height ${fmtN(totalH)}" >96"  —  specialized freight or open-top trailer may be required` });
  else if (totalH > 72)  flags.push({ level: "warn",   msg: `Stack height ${fmtN(totalH)}"  —  verify dock door height and warehouse rack clearance` });
  // Coil weight
  if (lbs > 20000)      flags.push({ level: "danger", msg: `Coil weight ${lbs.toLocaleString()} lbs >20,000  —  heavy-lift equipment required` });
  else if (lbs > 15000) flags.push({ level: "warn",   msg: `Coil weight ${lbs.toLocaleString()} lbs  —  verify forklift rated capacity` });
  // Very long coil
  if (lengthFt > 8000) flags.push({ level: "info", msg: `Very long coil (${Math.round(lengthFt).toLocaleString()} ft)  —  confirm weld count with supplier` });
  return {
    density, volIn3: Math.round(volIn3),
    lengthIn: Math.round(lengthIn), lengthFt: Math.round(lengthFt),
    od: fmtN(od), skidLen, skidWid, skidH,
    totalH: fmtN(totalH), prodType, flags,
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
  // Interleave: standard kraft paper ~0.004" per sheet (industry standard for Al sheet/plate)
  const stackThk = q * t + Math.max(0, q - 1) * 0.004;
  const dunnage  = 1.0;
  const skidH    = 5.5;
  const totalH   = stackThk + dunnage + skidH;
  const skidLen  = l + 4;
  const skidWid  = w + 4;
  const prodType = getProductType(t);
  // else-if per category — only the highest-severity condition fires for each concern
  const flags = [];
  // Product classification
  if (prodType === "PLATE") flags.push({ level: "info", msg: `Plate classification (≥ .250")  —  edge/corner protection recommended in transit` });
  // Individual piece weight
  if (wtPerPc > 500)       flags.push({ level: "warn",   msg: `Individual piece ${fmtN(wtPerPc, 0)} lbs  —  mechanical handling required` });
  else if (wtPerPc > 300)  flags.push({ level: "info",   msg: `Individual piece ${fmtN(wtPerPc, 0)} lbs  —  mechanical assist recommended` });
  // Bundle total weight
  if (totalWt > 20000)     flags.push({ level: "danger", msg: `Bundle total >20,000 lbs  —  heavy-lift equipment required` });
  else if (totalWt > 4000) flags.push({ level: "warn",   msg: `Bundle total ${fmtN(totalWt, 0)} lbs  —  verify forklift capacity` });
  // Length / skid length
  if (skidLen > 240) flags.push({ level: "danger", msg: `Skid length ${skidLen}"  —  flatbed or specialized freight likely required` });
  else if (l > 192)  flags.push({ level: "warn",   msg: `Sheet length ${l}"  —  verify dock/trailer clearance for unloading` });
  return {
    density, wtPerPc: wtPerPc.toFixed(1), totalWt: totalWt.toFixed(1),
    stackThk: stackThk.toFixed(3), totalH: totalH.toFixed(1),
    skidLen: skidLen.toFixed(0), skidWid: skidWid.toFixed(0),
    skidH, prodType, flags,
  };
}

// ── SHARED: FLAG BANNERS ──────────────────────────────────────────────────────
function FlagBanner({ flag }) {
  const map = {
    danger: "from-red-900/30 to-red-800/30 border-red-500/50 text-red-300",
    warn:   "from-amber-900/30 to-orange-900/30 border-amber-500/50 text-amber-200",
    info:   "from-neutral-800/50 to-neutral-800/30 border-neutral-500/30 text-neutral-300",
  };
  const icon = { danger: "⚠", warn: "⚠", info: "◈" };
  return (
    <div className={`bg-gradient-to-r ${map[flag.level]} border p-3 mb-2 rounded-xl flex items-start gap-3`}>
      <span className="flex-shrink-0 mt-0.5">{icon[flag.level]}</span>
      <p className="text-sm font-medium">{flag.msg}</p>
    </div>
  );
}

// ── COIL DETAIL CARD ──────────────────────────────────────────────────────────
function CoilDetail({ result, inputs }) {
  const lbs       = parseFloat(inputs.weight);
  const totalHNum = parseFloat(result.totalH);
  const heightOk  = totalHNum <= 72;
  const heightWarn = totalHNum > 72 && totalHNum <= 96;

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      {/* Dark header — matches ICC section header style */}
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
        {/* 4-column metric grid — matches ICC renderDetailCard exactly */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

          {/* Coil Geometry */}
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

          {/* Skid Footprint */}
          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Skid Footprint</p>
            <p className="text-sm font-medium text-neutral-600">Skid Length (axis)</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.skidLen}"</p>
            <p className="text-xs text-neutral-400 mb-2">coil width + 2" each end</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Saddle Width:</span> <span className="font-bold">{result.skidWid}"</span></p>
            <p className="text-xs text-neutral-400">scales to OD</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Skid Height:</span> <span className="font-bold">{result.skidH}"</span></p>
          </div>

          {/* Stack Height */}
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

          {/* Freight Profile — amber card matches ICC skid/amber card */}
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

        {/* Flags */}
        {result.flags.length > 0 && (
          <div className="mb-4">{result.flags.map((f, i) => <FlagBanner key={i} flag={f} />)}</div>
        )}

        {/* Summary bar — matches ICC dark summary bar exactly */}
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
  const q         = parseInt(inputs.qty);
  const skidLenN  = parseFloat(result.skidLen);
  const skidOk    = skidLenN <= 144;
  const skidWarn  = skidLenN > 144 && skidLenN <= 240;

  return (
    <div className="glass-card rounded-2xl shadow-xl overflow-hidden mb-5 border border-neutral-200">
      {/* Dark header */}
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
        {/* 4-column metric grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">

          {/* Piece / Bundle */}
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

          {/* Stack Profile */}
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

          {/* Skid Footprint */}
          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 p-3 rounded-xl border border-neutral-200">
            <p className="font-bold text-red-700 mb-2 text-sm uppercase tracking-wide">Skid Footprint</p>
            <p className="text-sm font-medium text-neutral-600">Skid Length</p>
            <p className="text-2xl font-extrabold text-neutral-900 mb-0.5">{result.skidLen}"</p>
            <p className="text-xs text-neutral-400 mb-2">sheet length + 2" each end</p>
            <p className="text-sm"><span className="font-medium text-neutral-600">Skid Width:</span> <span className="font-bold">{result.skidWid}"</span></p>
            <p className="text-xs text-neutral-400">sheet width + 2" each side</p>
            <p className="text-sm mt-1"><span className="font-medium text-neutral-600">Skid Height:</span> <span className="font-bold">{result.skidH}"</span></p>
          </div>

          {/* Freight Profile */}
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

        {/* Flags */}
        {result.flags.length > 0 && (
          <div className="mb-4">{result.flags.map((f, i) => <FlagBanner key={i} flag={f} />)}</div>
        )}

        {/* Summary bar */}
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

// ── TECH REFERENCE (collapsed by default like ICC) ────────────────────────────
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
            {/* Alloy density table */}
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
            {/* Coil formulas */}
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Coil Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Volume:</span> Weight ÷ Density</p>
                <p><span className="font-bold text-neutral-800">Length:</span> Volume ÷ (Gauge × Width)</p>
                <p><span className="font-bold text-neutral-800">OD:</span> √(4 × L × t ÷ π + ID²)</p>
                <p><span className="font-bold text-neutral-800">Stack Height:</span> OD + 6" skid</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">
                  <span className="font-bold text-neutral-800">Saddle width</span> scales with OD — widens for large coils to maintain stability.
                </p>
              </div>
            </div>
            {/* Sheet formulas */}
            <div>
              <p className="font-bold text-neutral-700 mb-2 uppercase tracking-wide text-xs">Sheet / Plate Geometry</p>
              <div className="space-y-2 text-xs text-neutral-600">
                <p><span className="font-bold text-neutral-800">Wt/Pc:</span> L × W × t × Density</p>
                <p><span className="font-bold text-neutral-800">Stack:</span> Qty × Gauge + (Qty−1) × 0.004" interleave (standard kraft paper)</p>
                <p><span className="font-bold text-neutral-800">Total H:</span> Stack + 1.0" dunnage + 5.5" skid</p>
                <p><span className="font-bold text-neutral-800">Skid L:</span> Sheet Length + 4"</p>
                <p><span className="font-bold text-neutral-800">Skid W:</span> Sheet Width + 4"</p>
                <p className="mt-2 pt-2 border-t border-neutral-100">Plate ≥ .250" per ASTM B209. Sheet ≤ .249".</p>
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
  const [coilIn,    setCoilIn]    = useState({ alloy: "3003", thickness: "", width: "", weight: "", coreId: "20" });
  const [coilResult, setCoilResult] = useState(null);
  const [sheetIn,   setSheetIn]   = useState({ alloy: "3003", thickness: "", width: "", length: "", qty: "" });
  const [sheetResult, setSheetResult] = useState(null);

  const setC = key => val => setCoilIn(p => ({ ...p, [key]: val }));
  const setS = key => val => setSheetIn(p => ({ ...p, [key]: val }));
  const doCoilCalc  = () => setCoilResult(calcCoil(coilIn));
  const doSheetCalc = () => setSheetResult(calcSheet(sheetIn));
  const coilKey  = e => { if (e.key === "Enter") doCoilCalc(); };
  const sheetKey = e => { if (e.key === "Enter") doSheetCalc(); };
  const handleClear = () => {
    setCoilIn({ alloy: "3003", thickness: "", width: "", weight: "", coreId: "20" });
    setSheetIn({ alloy: "3003", thickness: "", width: "", length: "", qty: "" });
    setCoilResult(null); setSheetResult(null);
  };

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
                  <p className="text-sm text-neutral-500 font-medium">Coil · Sheet · Plate</p>
                </div>
              </div>
              <button
                onClick={handleClear}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl hover:from-red-700 hover:to-red-800 font-semibold text-sm"
              >
                <Trash2 className="w-4 h-4" />Clear All
              </button>
            </div>

            {/* Mode toggle — identical pattern to ICC cutting mode tabs */}
            <div className="flex rounded-lg overflow-hidden border border-neutral-300 w-fit text-xs font-bold mb-5">
              <button
                onClick={() => setMode("coil")}
                className={`px-6 py-2.5 transition-colors ${mode === "coil" ? "bg-neutral-800 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}
              >COIL</button>
              <button
                onClick={() => setMode("sheet")}
                className={`px-6 py-2.5 transition-colors ${mode === "sheet" ? "bg-red-600 text-white" : "bg-white text-neutral-600 hover:bg-neutral-100"}`}
              >SHEET / PLATE</button>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Alloy</label>
                    <select value={sheetIn.alloy} onChange={e => setS("alloy")(e.target.value)}
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
                      onChange={e => setS("thickness")(e.target.value)} onKeyDown={sheetKey} placeholder="0.250"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Width"</label>
                    <input type="number" step="0.1" value={sheetIn.width}
                      onChange={e => setS("width")(e.target.value)} onKeyDown={sheetKey} placeholder="48"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Length"</label>
                    <input type="number" step="0.1" value={sheetIn.length}
                      onChange={e => setS("length")(e.target.value)} onKeyDown={sheetKey} placeholder="144"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1.5 text-neutral-600">Qty (pcs)</label>
                    <input type="number" step="1" value={sheetIn.qty}
                      onChange={e => setS("qty")(e.target.value)} onKeyDown={sheetKey} placeholder="5"
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-white font-medium" />
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

          </div>{/* end glass-card */}

          {/* ── RESULT DETAIL CARDS ── */}
          {mode === "coil"  && coilResult  && !coilResult.error  && <CoilDetail  result={coilResult}  inputs={coilIn}  />}
          {mode === "sheet" && sheetResult && <SheetDetail result={sheetResult} inputs={sheetIn} />}

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
