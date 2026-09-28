/**
 * The shell and the navigation.
 *
 * The browser's back button does not work inside a code app (it belongs to the Power Apps player),
 * so the app keeps its own state of where you are — lesson from the Data Hub example. Here that is
 * simple: one screen at a time, and each list keeps its own selection.
 */

import { useCallback, useEffect, useState } from 'react'
import { AppShell, type ScreenId } from './components/AppShell'
import { source } from './data/source'
import type { JourneyCounts } from './data/types'
import { Overview } from './screens/Overview'
import { Prospects } from './screens/Prospects'
import { Leads, type LeadFilter } from './screens/Leads'
import { Proposals } from './screens/Proposals'
import { Customers } from './screens/Customers'
import { Dashboard } from './screens/Dashboard'

export default function App() {
  const [screen, setScreen] = useState<ScreenId>('overview')
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('koud')
  const [counts, setCounts] = useState<JourneyCounts>()
  const [toast, setToast] = useState<string>()

  // Counted from the tables, not remembered: the rail is how you see there is work waiting.
  const refreshCounts = useCallback(() => {
    source.getCounts().then(setCounts, () => setCounts(undefined))
  }, [])
  useEffect(refreshCounts, [refreshCounts])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(undefined), 3500)
    return () => clearTimeout(t)
  }, [toast])

  /** Every journey step calls this: counts refresh, and the user sees what happened. */
  const changed = useCallback(
    (message: string) => {
      setToast(message)
      refreshCounts()
    },
    [refreshCounts],
  )

  const go = (s: ScreenId, filter?: LeadFilter) => {
    if (filter) setLeadFilter(filter)
    setScreen(s)
  }

  return (
    <AppShell screen={screen} counts={counts} sourceName={source.name} onNavigate={(s) => go(s)}>
      {screen === 'overview' && <Overview counts={counts} onOpen={go} />}
      {screen === 'prospects' && <Prospects onChanged={changed} onGoToLeads={() => go('leads', 'koud')} />}
      {screen === 'leads' && (
        <Leads key={leadFilter} initialFilter={leadFilter} onChanged={changed} onGoToProposals={() => go('proposals')} />
      )}
      {screen === 'proposals' && <Proposals onChanged={changed} onGoToCustomers={() => go('customers')} />}
      {screen === 'customers' && <Customers />}
      {screen === 'dashboard' && <Dashboard onOpen={go} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </AppShell>
  )
}
