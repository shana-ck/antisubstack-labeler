const useDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const theme = document.getElementById("theme")

function switchTheme(e) {
    if (e.target.checked) {
        document.documentElement.setAttribute('data-theme', 'dark')
    } else {
        document.documentElement.setAttribute('data-theme', 'light')
    }
}

if (useDark) {
    document.documentElement.setAttribute('data-theme', 'dark')
    theme.checked = true
}

theme.addEventListener('change', switchTheme)