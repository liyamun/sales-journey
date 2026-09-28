/**
 * The source is chosen HERE and nowhere else.
 *
 *   npm run dev        -> Dataverse, through the connector (open the Local Play URL)
 *   npm run dev:demo   -> sample data in memory, no Power Apps host needed
 *   npm run build      -> Dataverse (this is what `pac code push` publishes)
 */

import type { DataSource } from './DataSource'
import { dataverseSource } from './dataverseSource'
import { demoSource } from './demoSource'

export const source: DataSource = import.meta.env.MODE === 'demo' ? demoSource : dataverseSource
