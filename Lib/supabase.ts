import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const supabaseUrl = 'https://vpjbsovstlctgkvpqqal.supabase.co/'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwamJzb3ZzdGxjdGdrdnBxcWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzY0MjcsImV4cCI6MjA4ODIxMjQyN30.kckEPkdsxXG-5np5gQkHawDMzCfoGgt3ysST3jH0TNk'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })