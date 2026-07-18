'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export interface EventColors {
  primary: string
  secondary: string
}

interface EventThemeContextType {
  colors: EventColors
  setColors: (colors: EventColors) => void
}

const defaultColors: EventColors = {
  primary: '#1B3A6B',
  secondary: '#C49A00',
}

const EventThemeContext = createContext<EventThemeContextType>({
  colors: defaultColors,
  setColors: () => {},
})

export function EventThemeProvider({
  children,
  initialColors,
}: {
  children: React.ReactNode
  initialColors?: EventColors
}) {
  const [colors, setColors] = useState<EventColors>(initialColors || defaultColors)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--event-primary', colors.primary)
    root.style.setProperty('--event-secondary', colors.secondary)
  }, [colors])

  return (
    <EventThemeContext.Provider value={{ colors, setColors }}>
      {children}
    </EventThemeContext.Provider>
  )
}

export function useEventTheme() {
  return useContext(EventThemeContext)
}
