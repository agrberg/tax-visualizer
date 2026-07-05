import { useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { shareHash } from '@/shareLink'
import type { TaxInput } from '@/tax/types'

/** Copies a shareable link that encodes the current inputs in the URL hash. */
export function ShareLinkButton({ input }: { input: TaxInput }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}${shareHash(input)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (e.g. insecure context) — no-op
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="w-full" onClick={copy}>
      {copied ? (
        <>
          <Check className="size-3.5" /> Link copied
        </>
      ) : (
        <>
          <Link2 className="size-3.5" /> Copy share link
        </>
      )}
    </Button>
  )
}
