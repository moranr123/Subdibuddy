import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';

const THEME_STORAGE_KEY = '@app_theme';

interface Theme {
  background: string;
  cardBackground: string;
  text: string;
  textSecondary: string;
  border: string;
  headerBackground: string;
  inputBackground: string;
  inputBorder: string;
  placeholderText: string;
  sectionBackground: string;
}

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: (value: boolean) => Promise<void>;
  theme: Theme;
}

const lightTheme: Theme = {
  background: '#f9fafb',
  cardBackground: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  headerBackground: '#111827',
  inputBackground: '#ffffff',
  inputBorder: '#d1d5db',
  placeholderText: '#9ca3af',
  sectionBackground: '#ffffff',
};

const darkTheme: Theme = {
  background: '#111827',
  cardBackground: '#1f2937',
  text: '#f9fafb',
  textSecondary: '#d1d5db',
  border: '#374151',
  headerBackground: '#0f172a',
  inputBackground: '#1f2937',
  inputBorder: '#4b5563',
  placeholderText: '#9ca3af',
  sectionBackground: '#1f2937',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (savedTheme) {
          setIsDarkMode(savedTheme === 'dark');
        } else {
          setIsDarkMode(systemColorScheme === 'dark');
        }
      } catch (error) {
        console.error('Error loading theme:', error);
        setIsDarkMode(systemColorScheme === 'dark');
      } finally {
        setIsLoading(false);
      }
    };
    loadTheme();
  }, [systemColorScheme]);

  const toggleDarkMode = async (value: boolean) => {
    try {
      setIsDarkMode(value);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, value ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const theme = isDarkMode ? darkTheme : lightTheme;

  if (isLoading) {
    return null; // Or a loading spinner
  }

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}







