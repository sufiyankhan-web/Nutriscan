import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Webcam from 'react-webcam'
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Database,
  Info,
  Leaf,
  LogOut,
  ScanLine,
  Shield,
  Upload,
  Users,
  Zap,
} from 'lucide-react'

const dietaryProfiles = [
  'Diabetes (Type II)',
  'Hypertension / High BP',
  'Severe Nut Allergy',
  'Gluten Intolerance',
  'Vegan / Plant-Based',
  'Lactose Intolerance',
]

const webcamConstraints = {
  facingMode: 'environment',
}

function hazardTheme(level) {
  const value = String(level || '').toLowerCase()

  if (value.includes('red') || value.includes('critical') || value.includes('high')) {
    return {
      label: 'High Risk',
      shell: 'border-rose-200 bg-rose-50/90 text-rose-800',
      badge: 'border-rose-200 bg-rose-100 text-rose-700',
      pill: 'border-rose-200 bg-rose-100 text-rose-700',
      dot: 'bg-rose-500',
      text: 'text-rose-700',
    }
  }

  if (value.includes('yellow') || value.includes('medium') || value.includes('moderate')) {
    return {
      label: 'Moderate Risk',
      shell: 'border-amber-200 bg-amber-50/90 text-amber-900',
      badge: 'border-amber-200 bg-amber-100 text-amber-700',
      pill: 'border-amber-200 bg-amber-100 text-amber-700',
      dot: 'bg-amber-500',
      text: 'text-amber-700',
    }
  }

  if (value.includes('green') || value.includes('low') || value.includes('safe')) {
    return {
      label: 'Low Risk',
      shell: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
      badge: 'border-emerald-200 bg-emerald-100 text-emerald-700',
      pill: 'border-emerald-200 bg-emerald-100 text-emerald-700',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700',
    }
  }

  return {
    label: 'Awaiting Scan',
    shell: 'border-slate-200 bg-white/90 text-slate-800',
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    pill: 'border-slate-200 bg-slate-100 text-slate-700',
    dot: 'bg-sky-500',
    text: 'text-sky-700',
  }
}

export default function App() {
  const webcamRef = useRef(null)

  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [user, setUser] = useState({ name: '', diseases: [] })
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return undefined
    }

    const objectUrl = URL.createObjectURL(selectedFile)
    setPreviewUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [selectedFile])

  const handleAuthToggle = useCallback((disease) => {
    setUser((prev) => ({
      ...prev,
      diseases: prev.diseases.includes(disease)
        ? prev.diseases.filter((item) => item !== disease)
        : [...prev.diseases, disease],
    }))
  }, [])

  const handleLogin = useCallback((event) => {
    event.preventDefault()

    if (!user.name.trim()) {
      setErrorMessage('Please enter your name before launching the dashboard.')
      return
    }

    if (user.diseases.length === 0) {
      setErrorMessage('Please select at least one dietary profile.')
      return
    }

    setErrorMessage('')
    setIsLoggedIn(true)
  }, [user])

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false)
    setAnalysisResult(null)
    setPreviewUrl(null)
    setSelectedFile(null)
    setErrorMessage('')
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/history')
      const data = await response.json()
      if (response.ok && data.success) setScanHistory(data.history || [])
    } catch {
      setScanHistory([])
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn) loadHistory()
  }, [isLoggedIn, loadHistory])

  const capturePhoto = useCallback(async () => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (!imageSrc) {
      setErrorMessage('Unable to capture a frame from the webcam.')
      return
    }

    setPreviewUrl(imageSrc)
    const response = await fetch(imageSrc)
    const blob = await response.blob()
    const file = new File([blob], 'webcam_capture.jpg', { type: 'image/jpeg' })
    setSelectedFile(file)
    setErrorMessage('')
  }, [])

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setErrorMessage('')
  }, [])

  const handleDrop = useCallback((event) => {
    event.preventDefault()
    setDragActive(false)

    const file = event.dataTransfer?.files?.[0]
    if (file) {
      setSelectedFile(file)
      setErrorMessage('')
    }
  }, [])

  const runAudit = useCallback(async () => {
    if (!selectedFile) {
      setErrorMessage('Please capture or upload a label image first.')
      return
    }

    setIsScanning(true)
    setErrorMessage('')
    setAnalysisResult(null)

    const formData = new FormData()
    formData.append('image', selectedFile)
    formData.append('diseases', JSON.stringify(user.diseases))

    try {
      const response = await fetch('http://127.0.0.1:8000/scan', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Analysis failed.')
      }

      setAnalysisResult(data)
      loadHistory()
    } catch (error) {
      setErrorMessage(error.message || 'Server Connection Error. Ensure your Python backend is running.')
    } finally {
      setIsScanning(false)
    }
  }, [loadHistory, selectedFile, user.diseases])

  const geminiAnalysis = analysisResult?.gemini_analysis || {}
  const validRiskLevels = ['LOW', 'MODERATE', 'HIGH']
  const geminiRisk = validRiskLevels.includes(geminiAnalysis.risk_level)
    ? geminiAnalysis.risk_level
    : validRiskLevels.includes(analysisResult?.risk_level)
      ? analysisResult.risk_level
      : null
  const analysisUnavailable = Boolean(analysisResult) && !geminiRisk
  const analysisTheme = useMemo(() => hazardTheme(geminiRisk), [geminiRisk])
  const detectedAdditives = analysisResult?.detected_additives || []
  const scanStatus = isScanning
    ? 'Analyzing'
    : analysisUnavailable
      ? 'Analysis Unavailable'
      : geminiRisk
        ? 'Analysis Complete'
        : selectedFile
          ? 'Image Ready'
          : 'Awaiting Scan'
  const resultBadgeLabel = analysisUnavailable ? 'Analysis Unavailable' : analysisTheme.label

  if (!isLoggedIn) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-50 px-6 py-12 font-sans text-slate-900">
        <div className="absolute -left-20 top-[-10%] h-[36rem] w-[36rem] rounded-full bg-sky-200/45 blur-3xl" />
        <div className="absolute bottom-[-18%] right-[-12%] h-[30rem] w-[30rem] rounded-full bg-cyan-200/40 blur-3xl" />

        <div className="relative mx-auto grid min-h-[calc(100vh-6rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden pr-6 lg:block">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-sky-700 shadow-sm backdrop-blur-2xl">
              <Shield className="h-4 w-4" />
              Nutritional Intelligence Engine
            </div>

            <h1 className="mt-7 text-5xl font-black tracking-tight text-slate-900">
              Nutri<span className="text-sky-600">Scan</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Premium ingredient intelligence for health-conscious consumers, dietitians, and food-tech teams.
              Detect hidden allergens, additives, and nutritional red flags with personalized dietary analysis.
            </p>

            <div className="mt-10 grid grid-cols-2 gap-5 xl:grid-cols-3">
              <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-2xl">
                <Database className="h-6 w-6 text-sky-600" />
                <div className="mt-4 text-3xl font-black">446</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Indexed additives</div>
              </div>
              <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-2xl">
                <Zap className="h-6 w-6 text-cyan-600" />
                <div className="mt-4 text-lg font-black">OpenCV + EasyOCR</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">OCR Pipeline</div>
              </div>
              <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-2xl">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <div className="mt-4 text-lg font-black">INS / E-code</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Rule Analysis</div>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-white/60 bg-white/75 p-7 shadow-[0_20px_60px_-15px_rgba(2,132,199,0.15)] backdrop-blur-2xl sm:p-10">
            <div className="mb-8">
              <div className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-700/80">NutriScan</div>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Configure Workspace</h2>
              <p className="mt-2 text-sm font-medium text-slate-500">Enter your details and select your dietary profile.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 ml-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Full Name</label>
                  <input
                    type="text"
                    placeholder="Alex Carter"
                    required
                    value={user.name}
                    onChange={(event) => setUser((prev) => ({ ...prev, name: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 font-medium text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                  />
                </div>

                <div>
                  <label className="mb-2 ml-1 block text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Account Email</label>
                  <input
                    type="email"
                    placeholder="alex@example.com"
                    required
                    className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 font-medium text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                  />
                </div>
              </div>

              <div>
                <label className="mb-3 ml-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  <Activity className="h-4 w-4" />
                  Select Dietary Constraints
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {dietaryProfiles.map((profile) => {
                    const active = user.diseases.includes(profile)
                    return (
                      <button
                        key={profile}
                        type="button"
                        onClick={() => handleAuthToggle(profile)}
                        className={`rounded-2xl border px-4 py-3 text-xs font-bold transition ${active
                          ? 'border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-600/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50/60'
                          }`}
                      >
                        {profile}
                      </button>
                    )
                  })}
                </div>
              </div>

              {errorMessage ? (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-2xl bg-slate-900 py-4 text-base font-bold tracking-wide text-white shadow-xl shadow-slate-900/20 transition hover:-translate-y-0.5 hover:bg-sky-600"
              >
                Launch Dashboard
              </button>
            </form>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28 font-sans text-slate-800">
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900">
              Nutri<span className="text-sky-600">Scan</span>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Nutritional Intelligence Engine</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm md:flex">
              {user.name || 'Operator'}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" />
              Exit
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl space-y-10 px-4 pt-10 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
          <div className="absolute right-0 top-0 h-80 w-80 -translate-y-1/3 translate-x-1/3 rounded-full bg-sky-100/70 blur-3xl" />
          <div className="relative max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              <Leaf className="h-3.5 w-3.5 text-emerald-500" />
              Dietary Intelligence Platform
            </div>
            <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl">
              <span className="block bg-gradient-to-r from-sky-600 to-cyan-500 bg-clip-text text-transparent">Food labels, decoded intelligently.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
              Scan an ingredient label to identify INS/E-codes, additives, and potential dietary concerns based on your selected profile.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 text-sky-600"><Users className="h-6 w-6" /></div>
                <div className="text-lg font-black text-slate-900">INS / E-code</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Additive identification</div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 text-cyan-600"><Database className="h-6 w-6" /></div>
                <div className="text-3xl font-black text-slate-900">446</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Indexed additives</div>
              </div>
              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 text-emerald-600"><Shield className="h-6 w-6" /></div>
                <div className="text-lg font-black text-slate-900">OpenCV + EasyOCR</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">OCR Pipeline</div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section className="lg:col-span-7 rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Label Scanner</h2>
                <p className="mt-1 text-sm text-slate-500">Capture the ingredient panel or upload a label image for analysis.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.22em] text-sky-700">
                <ScanLine className="h-4 w-4" />
                Live Feed
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border-4 border-slate-50 bg-slate-950 shadow-inner">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={webcamConstraints}
                className="h-[24rem] w-full object-cover sm:h-[28rem]"
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={capturePhoto}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-4 font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50"
              >
                <Camera className="h-5 w-5" />
                Capture Frame
              </button>

              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-4 font-bold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50">
                <Upload className="h-5 w-5" />
                Upload Label
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </section>

          <section className="lg:col-span-5 rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Scan Preview</h2>
                <p className="mt-1 text-sm text-slate-500">Review the captured label and run analysis.</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                <Activity className="h-4 w-4" />
                {scanStatus}
              </div>
            </div>

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex min-h-64 items-center justify-center overflow-hidden rounded-[28px] border-2 border-dashed p-4 transition ${dragActive ? 'border-sky-300 bg-sky-50/70' : 'border-slate-200 bg-slate-50'}`}
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="h-full w-full rounded-[20px] object-cover shadow-sm" />
              ) : (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
                    <ScanLine className="h-7 w-7" />
                  </div>
                  <div className="mt-4 text-sm font-bold text-slate-400">No label captured yet</div>
                  <div className="mt-1 text-xs text-slate-400">Capture a frame or upload an ingredient label to begin.</div>
                </div>
              )}
            </div>

            {errorMessage ? (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <span>{errorMessage}</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={runAudit}
              disabled={isScanning || !selectedFile}
              className={`mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 text-lg font-black transition ${!selectedFile
                ? 'cursor-not-allowed bg-slate-100 text-slate-400 shadow-none'
                : 'bg-slate-900 text-white shadow-xl shadow-slate-900/15 hover:-translate-y-0.5 hover:bg-sky-600'
                }`}
            >
              {isScanning ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Processing...
                </>
              ) : (
                <>
                  <Activity className="h-6 w-6" />
                  Analyze Label
                </>
              )}
            </button>
          </section>
        </div>

        {analysisResult ? (
          <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/50 sm:p-10">
            <div className="flex flex-col justify-between gap-6 border-b border-slate-100 pb-8 md:flex-row md:items-center">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Analysis Output</div>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Scan Result</h2>
              </div>

              <div className={`inline-flex items-center gap-3 rounded-2xl border-2 px-5 py-3 font-black shadow-sm ${analysisTheme.badge}`}>
                <span className={`h-3 w-3 rounded-full ${analysisTheme.dot}`} />
                {resultBadgeLabel}
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-slate-800">Detected Ingredients</h3>
                <div className="space-y-3">
                  {detectedAdditives.length > 0 ? detectedAdditives.map((additive) => (
                    <div key={additive.code} className="rounded-[24px] border border-slate-100 bg-slate-50 p-5 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-xl font-black text-slate-900">{additive.code} · {additive.name}</div>
                          <div className="mt-1 text-sm text-slate-500">{additive.functional_class}</div>
                        </div>
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${hazardTheme(additive.personalized_hazard).badge}`}>
                          {additive.personalized_hazard}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <div><strong>Base hazard:</strong> {additive.base_hazard}</div>
                        <div><strong>Matched conditions:</strong> {additive.matched_conditions?.join(', ') || 'None'}</div>
                      </div>
                      {additive.clinical_note ? <p className="mt-3 text-sm leading-6 text-slate-600">{additive.clinical_note === 'Pending AI clinical review' ? 'Awaiting personalized analysis' : additive.clinical_note}</p> : null}
                    </div>
                  )) : (
                    <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-600">
                      No recognized additive risks detected. OCR did not match a database additive code or ingredient name.
                    </div>
                  )}
                </div>
                <div className="rounded-[24px] border border-sky-100 bg-sky-50/60 p-5 text-sm text-slate-700">
                  <div className="font-black text-slate-900">Personalized Analysis</div>
                  <div className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-sky-700">SQLITE PROVIDES ADDITIVE CONTEXT · GEMINI PERSONALIZES THE ANALYSIS</div>
                  {analysisUnavailable ? (
                    <>
                      <p className="mt-3 text-base font-black text-slate-900">AI Analysis Unavailable</p>
                      <p className="mt-2 leading-7">The label was scanned successfully, but personalized AI analysis could not be completed. Please try again.</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-base font-black text-slate-900">{geminiAnalysis.summary || 'Analysis complete.'}</p>
                      <p className="mt-2 leading-7">{geminiAnalysis.reasoning || analysisResult.explanation || analysisResult.analysis?.clinical_reasoning || 'No explanation was returned.'}</p>
                      {geminiAnalysis.recommendation ? <p className="mt-3 leading-7"><strong>Recommendation:</strong> {geminiAnalysis.recommendation}</p> : null}
                      {geminiAnalysis.confidence !== undefined ? <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Confidence: {Math.round(geminiAnalysis.confidence * 100)}%</p> : null}
                    </>
                  )}
                </div>
                <details className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
                  <summary className="cursor-pointer text-sm font-black text-slate-700">View Extracted Text</summary>
                  <pre className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{analysisResult.raw_text || 'No OCR text returned.'}</pre>
                </details>
                <div className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="text-sm font-black uppercase tracking-[0.22em] text-slate-800">Analysis Evidence</div>
                  <div className="mt-4 space-y-3 text-sm text-slate-600">
                    {(analysisResult.evidence || []).map((item, index) => (
                      <div key={typeof item === 'string' ? `${item}-${index}` : item.code} className="rounded-2xl bg-slate-50 p-3">
                        {typeof item === 'string' ? item : <><strong>{item.code}</strong>: database match {item.database_match ? 'confirmed' : 'not found'}; selected condition {item.matched_conditions?.join(', ') || 'none'}; rule match {item.rule_match ? 'yes' : 'no'}; result {item.resulting_hazard}.</>}
                      </div>
                    ))}
                    {(analysisResult.evidence || []).length === 0 ? <div>No database evidence was produced for this scan.</div> : null}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-slate-800">Overall Personalized Hazard</h3>
                {geminiRisk ? (
                  <div className="flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black shadow-sm ${analysisTheme.pill}`}>
                      <span className={`h-2 w-2 rounded-full ${analysisTheme.dot}`} />
                      {geminiRisk}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
                    AI Analysis Unavailable
                  </div>
                )}

                <div className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Info className="h-4 w-4 text-sky-600" />
                    Profile
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {user.diseases.map((item) => (
                      <span key={item} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {scanHistory.length > 0 ? (
          <section className="rounded-[30px] border border-slate-200 bg-white p-7 shadow-sm sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Scan History</h2>
                <p className="mt-1 text-sm text-slate-500">Recent label reviews.</p>
              </div>
              <Database className="h-6 w-6 text-sky-600" />
            </div>
            <div className="mt-5 space-y-3">
              {scanHistory.map((scan) => (
                <div key={scan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
                  <div>
                    <div className="font-black text-slate-900">{['UNKNOWN', 'Unknown'].includes(scan.overall_hazard) ? 'Analysis Unavailable' : scan.overall_hazard} · {scan.detected_additives.map((item) => item.code).join(', ') || 'No recognized additives'}</div>
                    <div className="mt-1 text-slate-500">{new Date(scan.timestamp).toLocaleString()}</div>
                  </div>
                  <div className="max-w-xl text-slate-600">{scan.explanation}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
