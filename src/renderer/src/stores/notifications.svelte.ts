import { generateId } from '../../../shared/utils'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  actionLabel?: string
  onAction?: () => void
}

let notifications = $state<Notification[]>([])

function addNotification(
  type: Notification['type'],
  message: string,
  timeout = 4000,
  action?: { label: string; onClick: () => void }
) {
  const id = generateId('notif')
  notifications.push({
    id,
    type,
    message,
    actionLabel: action?.label,
    onAction: action?.onClick
  })
  notifications = [...notifications]

  if (timeout > 0) {
    setTimeout(() => removeNotification(id), timeout)
  }
}

function removeNotification(id: string) {
  notifications = notifications.filter((n) => n.id !== id)
}

export const notificationStore = {
  get notifications() { return notifications },
  add: addNotification,
  remove: removeNotification
}
