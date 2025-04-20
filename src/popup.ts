console.log("ThreadForge Popup Script Loaded!");

document.addEventListener('DOMContentLoaded', () => {
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = 'Ready!';
  }
});

// Add your popup script logic here
// This script runs when the extension icon is clicked 