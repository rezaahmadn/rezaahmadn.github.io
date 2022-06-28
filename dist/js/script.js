// Hamburger

const hamburger = document.querySelector('#hamburger')
const navMenu = document.querySelector('#nav-menu')

hamburger.addEventListener('click', function(){
  hamburger.classList.toggle('hamburger-active')
  navMenu.classList.toggle('hidden')
})

// Navbar fixed

window.onscroll = function() {
  const toTop = document.querySelector('#toTop')
  const header = document.querySelector('header')
  const fixedNav = header.offsetTop

  if(window.pageYOffset > fixedNav){
    header.classList.add('navbar-fixed')
    toTop.classList.remove('hidden')
    toTop.classList.add('flex')
  } else {
    toTop.classList.remove('flex')
    toTop.classList.add('hidden')
    header.classList.remove('navbar-fixed')
  }
}

// click anywhere
window.addEventListener('click', function(e){
  if(e.target !== navMenu && e.target !== hamburger){
    hamburger.classList.remove('hamburger-active')
    navMenu.classList.add('hidden')
  }
})

// Darkmode toggle

const darkToggle = document.querySelector('#dark-toggle')
const html = document.querySelector('html')

darkToggle.addEventListener('click', function(){
  // darkToggle.checked ? html.classList.add('dark') : html.classList.remove('dark')
  if(darkToggle.checked){
    html.classList.add('dark')
    localStorage.theme = 'dark'
  } else {
    html.classList.remove('dark')
    localStorage.theme = 'light'
  }
})

// move toggle position
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  darkToggle.checked = true;
} else {
  darkToggle.checked = false
}