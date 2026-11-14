export type NeedType =
  | 'store_supply'
  | 'equipment_servicing'
  | 'furniture_logistics'
  | 'venue_facility'

export type NonStoreStatus = 'pending' | 'in_progress' | 'resolved'

export const NEED_TYPE_OPTIONS: {
  value: NeedType
  label: string
  shortLabel: string
  description: string
  defaultAssignee: string
}[] = [
  {
    value: 'store_supply',
    label: 'Store Supply / Consumable',
    shortLabel: 'Store Supply',
    description: 'Stationery, food, toiletries & items bought for Central Stores',
    defaultAssignee: 'Stores',
  },
  {
    value: 'equipment_servicing',
    label: 'Equipment / ICT & Servicing',
    shortLabel: 'Equipment / ICT',
    description: 'Printers, photocopiers, laptops, projectors & repairs/servicing',
    defaultAssignee: 'Technical / ICT',
  },
  {
    value: 'furniture_logistics',
    label: 'Furniture & Logistics',
    shortLabel: 'Furniture / Logistics',
    description: 'Tables, chairs, canopies, vehicles & physical setup',
    defaultAssignee: 'Logistics',
  },
  {
    value: 'venue_facility',
    label: 'Venue / Facility & Maintenance',
    shortLabel: 'Venue / Facility',
    description: 'Office space allocation, A/C, doors, electrical & plumbing',
    defaultAssignee: 'Projects & Maintenance',
  },
]

export const NON_STORE_ASSIGNEE_OPTIONS = [
  'Technical / ICT',
  'Projects & Maintenance',
  'Logistics',
  'Secretariat',
  'Accommodation & Venue',
  'Electrical',
] as const

export const NON_STORE_STATUS_OPTIONS: { value: NonStoreStatus; label: string }[] = [
  { value: 'pending', label: 'Pending Action' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
]

export function normalizeNeedType(raw?: string | null): NeedType {
  if (
    raw === 'equipment_servicing' ||
    raw === 'furniture_logistics' ||
    raw === 'venue_facility'
  ) {
    return raw
  }
  return 'store_supply'
}

export function isStoreSupply(raw?: string | null): boolean {
  return normalizeNeedType(raw) === 'store_supply'
}

export function getNeedTypeMeta(raw?: string | null) {
  const norm = normalizeNeedType(raw)
  return NEED_TYPE_OPTIONS.find((o) => o.value === norm) || NEED_TYPE_OPTIONS[0]
}
