import { redirect } from 'next/navigation'

export default function RootPage() {
  // Rely on middleware for role-based redirects. If middleware fails,
  // redirect directly to the login page.
  redirect('/login')
}
