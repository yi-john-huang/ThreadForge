console.log("ThreadForge Popup Script Loaded!");

document.addEventListener("DOMContentLoaded", () => {
  const showButton = document.getElementById(
    "showCommentsBtn"
  ) as HTMLButtonElement;
  const statusElement = document.getElementById("status");
  const progressBar = document.getElementById(
    "progressBar"
  ) as HTMLProgressElement;

  if (!showButton || !statusElement || !progressBar) {
    console.error("Popup elements not found!");
    if (statusElement) statusElement.textContent = "Popup UI Error.";
    return;
  }

  // Function to update UI state
  function updateUI(isLoading: boolean, message: string) {
    if (statusElement) {
      statusElement.textContent = message;
    }
    if (progressBar) {
      progressBar.style.display = isLoading ? "block" : "none";
      if (isLoading) {
        progressBar.removeAttribute("value");
      } else {
        progressBar.value = progressBar.max;
      }
    }
    if (showButton) {
      showButton.disabled = isLoading;
    }
  }

  // Check if the active tab is a Threads page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (
      !currentTab ||
      !currentTab.id ||
      !currentTab.url ||
      (!currentTab.url.includes("threads.net") &&
        !currentTab.url.includes("localhost"))
    ) {
      updateUI(true, "Not on a Threads page."); // Disable button
    } else {
      updateUI(false, "Ready to gather comments."); // Enable button
    }
  });

  showButton.addEventListener("click", () => {
    console.log("'Show Comments Panel' button clicked");
    updateUI(true, "Gathering comments..."); // Show progress bar

    // Find active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      // Basic check needed again for safety
      if (!currentTab || !currentTab.id) {
        console.error("Could not get active tab ID.");
        updateUI(false, "Error: Could not find active tab.");
        return;
      }
      const validTabId = currentTab.id; // Store ID

      console.log(`Sending 'gatherComments' message to tab ID: ${validTabId}`);

      // Send message to content script to start gathering
      chrome.tabs.sendMessage(
        validTabId,
        { action: "gatherComments" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending/receiving gather message:",
              chrome.runtime.lastError.message
            );
            updateUI(
              false,
              `Error: ${chrome.runtime.lastError.message || "No response from content script. Reload?"}`
            );
            return;
          }

          if (response && response.success) {
            console.log("Received comment data:", response.data);
            updateUI(true, "Displaying panel..."); // Keep progress bar for display step

            // Send another message to display the data
            chrome.tabs.sendMessage(
              validTabId,
              { action: "displayComments", data: response.data },
              (displayResponse) => {
                let finalStatus = "";
                if (chrome.runtime.lastError) {
                  console.error(
                    "Error sending display message:",
                    chrome.runtime.lastError.message
                  );
                  finalStatus = `Error displaying panel: ${chrome.runtime.lastError.message || "Unknown error."}`;
                } else if (displayResponse && displayResponse.success) {
                  finalStatus = "Panel displayed!";
                } else {
                  finalStatus =
                    "Panel display failed or script did not respond.";
                }
                updateUI(false, finalStatus); // Hide progress, show final status
                // Close the popup after a short delay
                setTimeout(() => window.close(), 2000);
              }
            );
          } else {
            console.error("Failed to gather comments:", response);
            updateUI(
              false,
              `Failed: ${response?.error || "Unknown error gathering comments."}`
            );
          }
        }
      );
    });
  });
});

// Add your popup script logic here
// This script runs when the extension icon is clicked
