// Keep track of all loaded buffers.
var BUFFERS = {};

// Page-wide audio context.
var context = null;

function midiToFreq(midi) {
  return Math.pow(2, (midi - 69) / 12) * 440.0;
}

/**
 * Returns a random number between min (inclusive) and max (exclusive)
 */
function getRandomInInterval(min, max) {
    return Math.random() * (max - min) + min;
}

document.addEventListener('DOMContentLoaded', function() {
  try {
    // Fix up prefixing
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    context = new AudioContext();
  }
  catch(e) {
    alert("Web Audio API is not supported in this browser");
  }

});
