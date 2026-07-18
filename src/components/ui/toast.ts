export type ToastType = 'success' | 'error' | 'info' | 'warning'

/**
 * Renders a premium, glassmorphic toast notification in the DOM.
 * Slides in from the top right with micro-animations and glowing border.
 */
export function showToast(message: string, type: ToastType = 'info') {
  if (typeof window === 'undefined') return

  // Find or create global toast container
  let container = document.getElementById('glowing-toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'glowing-toast-container'
    container.className = 'print:hidden'
    container.style.position = 'fixed'
    container.style.top = '24px'
    container.style.right = '24px'
    container.style.zIndex = '99999'
    container.style.display = 'flex'
    container.style.flexDirection = 'column'
    container.style.gap = '10px'
    container.style.maxWidth = '360px'
    container.style.width = 'calc(100% - 48px)'
    document.body.appendChild(container)
  }

  // Create toast item
  const toast = document.createElement('div')
  toast.style.padding = '12px 16px'
  toast.style.borderRadius = '12px'
  toast.style.fontSize = '12.5px'
  toast.style.fontWeight = '600'
  toast.style.display = 'flex'
  toast.style.alignItems = 'center'
  toast.style.gap = '10px'
  toast.style.boxShadow = '0 10px 25px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)'
  toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
  toast.style.transform = 'translateX(50px) scale(0.95)'
  toast.style.opacity = '0'
  toast.style.backdropFilter = 'blur(16px)'
  toast.style.color = '#FFFFFF'

  // Type styling
  let icon = ''
  let border = ''
  let bg = ''
  let glowColor = ''

  if (type === 'success') {
    icon = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.4669 3.72684C11.7175 3.96614 11.7347 4.36106 11.5053 4.62089L6.50529 10.2876C6.38531 10.4237 6.21396 10.5 6.03332 10.5C5.85268 10.5 5.68132 10.4237 5.56134 10.2876L3.56134 8.02089C3.332 7.76106 3.34917 7.36614 3.59976 7.12684C3.85036 6.88754 4.25055 6.9045 4.47989 7.16433L6.03332 8.92361L10.5484 3.77443C10.7777 3.5146 11.1779 3.49754 11.4669 3.72684Z" fill="#34D399"/></svg>`
    border = '1px solid rgba(16, 185, 129, 0.25)'
    bg = 'rgba(6, 78, 59, 0.85)'
    glowColor = 'rgba(16, 185, 129, 0.15)'
  } else if (type === 'error') {
    icon = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.49997 1.5C4.18626 1.5 1.5 4.18626 1.5 7.49997C1.5 10.8137 4.18626 13.5 7.49997 13.5C10.8137 13.5 13.5 10.8137 13.5 7.49997C13.5 4.18626 10.8137 1.5 7.49997 1.5ZM8.24997 4.49997V8.24997H6.74997V4.49997H8.24997ZM8.24997 9.74997V11.25H6.74997V9.74997H8.24997Z" fill="#F87171"/></svg>`
    border = '1px solid rgba(239, 68, 68, 0.25)'
    bg = 'rgba(127, 29, 29, 0.85)'
    glowColor = 'rgba(239, 68, 68, 0.15)'
  } else if (type === 'warning') {
    icon = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.49997 0.75L0.75 12.75H14.25L7.49997 0.75ZM8.24997 5.25V9H6.74997V5.25H8.24997ZM8.24997 9.75V11.25H6.74997V9.75H8.24997Z" fill="#FBBF24"/></svg>`
    border = '1px solid rgba(245, 158, 11, 0.25)'
    bg = 'rgba(120, 53, 4, 0.85)'
    glowColor = 'rgba(245, 158, 11, 0.15)'
  } else {
    icon = `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.49997 1.5C4.18626 1.5 1.5 4.18626 1.5 7.49997C1.5 10.8137 4.18626 13.5 7.49997 13.5C10.8137 13.5 13.5 10.8137 13.5 7.49997C13.5 4.18626 10.8137 1.5 7.49997 1.5ZM7.49997 3.75C7.91418 3.75 8.24997 4.08579 8.24997 4.5C8.24997 4.91421 7.91418 5.25 7.49997 5.25C7.08576 5.25 6.74997 4.91421 6.74997 4.5C6.74997 4.08579 7.08576 3.75 7.49997 3.75ZM8.24997 6.75V11.25H6.74997V6.75H8.24997Z" fill="#60A5FA"/></svg>`
    border = '1px solid rgba(59, 130, 246, 0.25)'
    bg = 'rgba(30, 58, 138, 0.85)'
    glowColor = 'rgba(59, 130, 246, 0.15)'
  }

  toast.style.border = border
  toast.style.background = bg
  toast.style.boxShadow = `0 10px 25px rgba(0,0,0,0.6), 0 0 15px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`

  // Toast Layout
  const iconWrapper = document.createElement('div')
  iconWrapper.style.display = 'flex'
  iconWrapper.style.alignItems = 'center'
  iconWrapper.style.justifyContent = 'center'
  iconWrapper.style.flexShrink = '0'
  iconWrapper.innerHTML = icon

  const textWrapper = document.createElement('div')
  textWrapper.style.flexGrow = '1'
  textWrapper.style.lineHeight = '1.4'
  textWrapper.style.fontFamily = 'var(--font-sans), system-ui, -apple-system, sans-serif'
  textWrapper.innerText = message

  const closeButton = document.createElement('button')
  closeButton.style.background = 'none'
  closeButton.style.border = 'none'
  closeButton.style.color = 'rgba(255,255,255,0.4)'
  closeButton.style.fontSize = '14px'
  closeButton.style.cursor = 'pointer'
  closeButton.style.padding = '0 2px'
  closeButton.style.lineHeight = '1'
  closeButton.style.transition = 'color 0.15s ease'
  closeButton.innerText = '×'
  closeButton.onmouseenter = () => closeButton.style.color = '#FFFFFF'
  closeButton.onmouseleave = () => closeButton.style.color = 'rgba(255,255,255,0.4)'
  closeButton.onclick = () => {
    toast.style.transform = 'translateX(50px) scale(0.95)'
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 200)
  }

  toast.appendChild(iconWrapper)
  toast.appendChild(textWrapper)
  toast.appendChild(closeButton)

  container.appendChild(toast)

  // Micro-task slide in
  setTimeout(() => {
    toast.style.transform = 'translateX(0) scale(1)'
    toast.style.opacity = '1'
  }, 15)

  // Auto-expire timer
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = 'translateX(50px) scale(0.95)'
      toast.style.opacity = '0'
      setTimeout(() => toast.remove(), 300)
    }
  }, 4200)
}
