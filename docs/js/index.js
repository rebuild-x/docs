// Optimized Docsify plugin for production
const plugin = (hook, vm) => {
  // Define dark theme settings
  const darkThemeConfig = {
    siteFont: "PT Sans",
    codeFontFamily: 'Roboto Mono, Monaco, courier, monospace',
    bodyFontSize: '17px',
    accent: '#42b983',
    background: '#091a28',
    textColor: '#b4b4b4',
    codeTextColor: '#ffffff',
    codeBackgroundColor: '#0e2233',
    borderColor: '#0d2538',
    blockQuoteColour: '#858585',
    highlightColor: '#d22778',
    sidebarSublink: '#b4b4b4',
    codeTypeColor: '#ffffff',
    coverBackground: 'linear-gradient(to left bottom, hsl(118, 100%, 85%) 0%,hsl(181, 100%, 85%) 100%)'
  };

  // Apply dark theme settings
  const applyDarkTheme = () => {
    Object.entries(darkThemeConfig).forEach(([key, value]) => {
      document.documentElement.style.setProperty('--' + key, value);
    });
    document.documentElement.style.setProperty('color-scheme', 'dark');
  };

  // Add dark theme to code blocks
  const applyDarkThemeToCodeBlocks = () => {
    document.querySelectorAll('pre, code').forEach(el => {
      el.classList.add('dark-theme');
    });
  };

  // Initialize theme settings
  try {
    applyDarkTheme();
  } catch (error) {
    console.error("Error applying dark theme:", error);
  }

  // Hook to apply dark theme to code blocks after each page load
  hook.doneEach(() => {
    try {
      applyDarkThemeToCodeBlocks();
    } catch (error) {
      console.error("Error applying dark theme to code blocks:", error);
    }
  });
};

// Add the plugin to Docsify
window.$docsify.plugins = [].concat(plugin, window.$docsify.plugins);