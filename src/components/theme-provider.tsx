'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

export interface ThemeColors {
  primary: string
  secondary: string
}

interface ThemeContextType {
  colors: ThemeColors
  setColors: (colors: ThemeColors) => void
}

const defaultColors: ThemeColors = {
  primary: '#1B3A6B',
  secondary: '#C49A00',
}

const ThemeContext = createContext<ThemeContextType>({
  colors: defaultColors,
  setColors: () => {},
})

export function ThemeProvider({
  children,
  initialColors,
}: {
  children: React.ReactNode
  initialColors?: ThemeColors
}) {
  const [colors, setColors] = useState<ThemeColors>(initialColors || defaultColors)

  useEffect(() => {
    // Inject CSS variables dynamically into the document
    const root = document.documentElement
    root.style.setProperty('--event-primary', colors.primary)
    root.style.setProperty('--event-secondary', colors.secondary)
  }, [colors])

  return (
    <ThemeContext.Provider value={{ colors, setColors }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useEventTheme() {
  return useContext(ThemeContext)
}
