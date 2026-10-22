/*
 * The app's three typefaces, served from this app itself (@fontsource packages)
 * rather than Google Fonts. The Google stylesheet was a render-blocking request
 * to the internet in <head>: on a slow or flaky connection the login page sat
 * blank until it gave up, and with no internet the fonts never arrived. Latin
 * subset only, and only the weights the UI uses.
 */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
