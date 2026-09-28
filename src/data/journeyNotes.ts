/**
 * Every journey step writes a note (annotation) with a FIXED subject. The dashboard reads those
 * notes back as events. So the subjects below are a contract: write them only through `NOTE`,
 * and never rename one without also keeping the old text in `kindOf` — otherwise history drops
 * out of the dashboard.
 *
 * Later, when the contact channel deserves its own column (a choice column on lead), the
 * dashboard can read that instead. Until then this keeps everything on standard tables.
 */

import type { ContactChannel, JourneyEventKind } from './types'
import { CHANNEL_LABELS } from './types'

export const NOTE = {
  validated: 'Gevalideerd als prospect',
  contact: (c: ContactChannel) => `Contact via ${CHANNEL_LABELS[c].toLowerCase()}`,
  meetingYes: 'Afspraak gemaakt',
  meetingNo: 'Geen afspraak - gestopt',
  proposal: 'Voorstelling gestart vanuit warme lead',
  agreed: 'Akkoord - wordt klant',
  refused: 'Geen akkoord - gestopt',
} as const

const CHANNEL_BY_SUBJECT = new Map<string, ContactChannel>(
  (Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((c) => [NOTE.contact(c), c]),
)

/** What a note subject means for the journey, or undefined for a note someone typed by hand. */
export function kindOf(subject: string): { kind: JourneyEventKind; channel?: ContactChannel } | undefined {
  const channel = CHANNEL_BY_SUBJECT.get(subject)
  if (channel) return { kind: 'contact', channel }
  switch (subject) {
    case NOTE.validated:
      return { kind: 'gevalideerd' }
    case NOTE.meetingYes:
      return { kind: 'afspraak-ja' }
    case NOTE.meetingNo:
      return { kind: 'afspraak-nee' }
    case NOTE.proposal:
      return { kind: 'voorstelling' }
    case NOTE.agreed:
      return { kind: 'akkoord' }
    case NOTE.refused:
      return { kind: 'geweigerd' }
    default:
      return undefined
  }
}
