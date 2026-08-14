/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /**
         * UEducate brand tokens - see BRANDING.md. Values extracted from the live
         * site (www.ueducate.in): `primary` is the literal background of their
         * .btn-primary; `ink` is the dominant pixel color of their logo wordmark.
         *
         * `strong` exists because the authentic teal fails WCAG AA under white text
         * (2.49:1). It is the same hue/saturation darkened to 4.88:1, so the brand
         * reads identically while text stays compliant.
         */
        ueducate: {
          primary: '#3AB2CC', // authentic - decorative only (gradients, accent bars, chart marks)
          strong: '#257B8E', // AA-safe (4.88:1 on white) - button fills, link text
          hover: '#2B9FB7', // authentic hover/active teal - non-text surfaces
          ink: '#2F383A', // logo wordmark charcoal (12.02:1 on white)
          accent: '#5BC9ED', // light accent from inside the shield mark - small highlights
        },
        /**
         * The app's `brand-*` scale, re-based onto the UEducate teal hue (H 190.7,
         * S 58.9) so existing usages inherit the branding. Step 500 is the authentic
         * #3AB2CC; step 700 is the AA-safe #257B8E. Contrast-critical steps were
         * measured, not eyeballed: white-on-700 = 4.88:1, 700-on-white = 4.88:1,
         * 800-on-100 = 6.18:1, 600-vs-white = 3.26:1 (non-text focus-ring threshold).
         */
        brand: {
          50: '#eef9fc',
          100: '#d8f2f8',
          200: '#b4e4ee',
          300: '#85d0e0',
          400: '#55bdd3',
          500: '#3ab2cc',
          600: '#2e9bb2',
          700: '#257b8e',
          800: '#1c5f6d',
          900: '#154651',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        glass: '0 1px 1px 0 rgb(15 23 42 / 0.03), 0 8px 24px -4px rgb(58 178 204 / 0.16), inset 0 1px 0 0 rgb(255 255 255 / 0.5)',
      },
      keyframes: {
        'toast-in': { from: { opacity: '0', transform: 'translateY(0.5rem)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-20px)' } },
        blob: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(30px,-40px) scale(1.12)' },
          '66%': { transform: 'translate(-25px,25px) scale(0.92)' },
        },
        'gradient-x': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        drift: { from: { backgroundPosition: '0 0' }, to: { backgroundPosition: '60px 60px' } },
        'ring-pulse': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'toast-in': 'toast-in 0.2s ease-out',
        shimmer: 'shimmer 1.5s infinite',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.9s ease-out both',
        float: 'float 7s ease-in-out infinite',
        'float-slow': 'float 11s ease-in-out infinite',
        blob: 'blob 20s ease-in-out infinite',
        'blob-slow': 'blob 28s ease-in-out infinite',
        'gradient-x': 'gradient-x 6s ease infinite',
        drift: 'drift 3s linear infinite',
        'ring-pulse': 'ring-pulse 2.4s ease-out infinite',
      },
    },
  },
  plugins: [],
};
