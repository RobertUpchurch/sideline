import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import QRCode from 'qrcode'
import { Body, Button, CopyIcon, Screen, ShareIcon, TopBar } from '~/components/ui'

export const Route = createFileRoute('/share')({
  component: Share,
})

/**
 * A QR code of this app's own address.
 *
 * Generated at runtime from `location.origin`, so whoever hosts a copy of
 * Sideline gets a code pointing at their deployment with nothing to configure.
 * The code is drawn locally; no image service is involved, and the screen works
 * with no signal at all.
 */
function Share() {
  const [url, setUrl] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const origin = window.location.origin
    setUrl(origin)
    // Rendered to a data URL rather than onto a canvas: the canvas renderer
    // sets inline pixel dimensions that override any CSS, which overflows a
    // narrow phone. An image scales to its container and can be long-pressed
    // and saved for a flyer.
    QRCode.toDataURL(origin, {
      // Four modules of quiet zone is what the spec asks for. At one, the
      // finder patterns crowd the rounded corners of the card and the code
      // reads as though it is spilling out of its box — and a scanner has
      // less to lock onto.
      margin: 4,
      // Quartile recovery. For a URL this short it needs no more modules than
      // the medium level, so the extra robustness is free — useful if a coach
      // prints the code on a flyer. The highest level would cost four more
      // modules a side for redundancy this will never need.
      errorCorrectionLevel: 'Q',
      width: 640,
      color: { dark: '#101B14FF', light: '#FFFFFFFF' },
    })
      .then(setQr)
      .catch(() => setFailed(true))
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setFailed(true)
    }
  }

  const share = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: 'Sideline',
          text: 'A free sub timer for youth soccer coaches.',
          url,
        })
        return
      } catch {
        // The sheet was dismissed, or sharing is unavailable here.
      }
    }
    void copy()
  }

  return (
    <Screen>
      <TopBar title="Share Sideline" back={{ to: '/' }} />

      <Body className="items-center gap-5 px-5 pt-2">
        <div className="flex flex-col gap-1.5 text-center">
          <h2 className="cond text-[30px] leading-none font-extrabold">
            Point a camera here
          </h2>
          <p className="text-[15px] text-muted">
            Then tap Add to Home Screen on their phone.
          </p>
        </div>

        {/*
          The image sizes the card, not the other way round.
          
          Giving the card an aspect ratio and the image `height: 100%` looks
          equivalent and is not: WebKit will not resolve a percentage height
          against a height that came from an aspect ratio, so on an iPhone the
          code grew past the card and broke out through the border. The QR is
          square by nature, so letting it lay itself out at full width with an
          automatic height needs no percentage at all. `overflow-hidden` is a
          belt and braces guard so nothing can cross the rounded corner again.
        */}
        <div className="w-full max-w-[318px] overflow-hidden rounded-3xl border-2 border-ink bg-white p-2">
          {qr ? (
            <img
              src={qr}
              alt={`QR code linking to ${url}`}
              className="block h-auto w-full"
              width={640}
              height={640}
            />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-chip" />
          )}
        </div>

        <div className="flex flex-col items-center gap-1">
          <p className="cond text-[22px] font-bold break-all">
            {url.replace(/^https?:\/\//, '')}
          </p>
          <p className="text-[13px] text-faint">
            The code always points at wherever this app is hosted.
          </p>
        </div>

        <div className="flex-1" />

        <div className="flex w-full flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Button tone="primary" onClick={copy}>
              <CopyIcon size={18} />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button tone="quiet" onClick={share}>
              <ShareIcon size={18} />
              Share…
            </Button>
          </div>
          {failed ? (
            <p className="text-center text-[13px] text-muted">
              This browser would not copy for us. The address above is the whole thing.
            </p>
          ) : null}
          <p className="text-center text-[13px] text-faint">
            Press and hold the code to save it, if you want it on a flyer. Sideline is free
            and open source, so any league can host its own copy.
          </p>
        </div>
      </Body>
    </Screen>
  )
}
