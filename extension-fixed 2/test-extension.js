/**
 * ClaudePacer Extension Test Script
 * Run this in the browser console on a test page to verify extension functionality
 */

// Test 1: Check if extension is loaded
function testExtensionLoaded() {
  console.log('Testing extension load...');
  
  // Check if chrome extension API is available
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log('Chrome extension API available');
    return true;
  } else {
    console.error('Chrome extension API not available');
    return false;
  }
}

// Test 2: Check storage functionality
async function testStorage() {
  console.log('Testing storage functionality...');
  
  try {
    const testData = { test: 'value', timestamp: Date.now() };
    await chrome.storage.local.set({ 'test_key': testData });
    
    const result = await chrome.storage.local.get('test_key');
    if (result.test_key && result.test_key.test === 'value') {
      console.log('Storage test passed');
      await chrome.storage.local.remove('test_key');
      return true;
    } else {
      console.error('Storage test failed');
      return false;
    }
  } catch (error) {
    console.error('Storage test error:', error);
    return false;
  }
}

// Test 3: Check background script communication
async function testBackgroundCommunication() {
  console.log('Testing background communication...');
  
  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'TEST_MESSAGE',
      data: 'test' 
    });
    
    console.log('Background communication test passed');
    return true;
  } catch (error) {
    console.error('Background communication test failed:', error);
    return false;
  }
}

// Test 4: Check side panel functionality
async function testSidePanel() {
  console.log('Testing side panel...');
  
  try {
    // Try to open side panel
    await chrome.sidePanel.open({ windowId: window.id });
    console.log('Side panel test passed');
    return true;
  } catch (error) {
    console.error('Side panel test failed:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('Starting ClaudePacer Extension Tests...');
  
  const results = {
    extensionLoaded: await testExtensionLoaded(),
    storage: await testStorage(),
    backgroundCommunication: await testBackgroundCommunication(),
    sidePanel: await testSidePanel()
  };
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log(`Test Results: ${passed}/${total} tests passed`);
  console.table(results);
  
  if (passed === total) {
    console.log('All tests passed! Extension is ready for deployment.');
  } else {
    console.warn('Some tests failed. Check the errors above.');
  }
  
  return results;
}

// Export for use in browser console
window.testClaudePacer = runAllTests;

console.log('ClaudePacer test script loaded. Run testClaudePacer() to start tests.');
