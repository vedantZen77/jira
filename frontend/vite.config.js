import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Note: Tailwind v4 has a Vite plugin '@tailwindcss/vite' which is the preferred way now along with CSS import.
// However, since I used PostCSS config earlier, I should stick to one method.
// Use PostCSS method: just react plugin.
// OR Switch to Tailwind Vite plugin completely.
// Let's stick to PostCSS method since I configured postcss.config.js.
// Wait, user installed @tailwindcss/postcss.
// So I don't need @tailwindcss/vite.

export default defineConfig({
    plugins: [react()],
})
