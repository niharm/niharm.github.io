// CONSTANTS
var noiseBuffer, noiseFilter, noiseGain; 

function SetUpNoise() {

        // Create an empty two second stereo buffer at the sample rate of the AudioContext
        var channels = 1;
        var frameCount = context.sampleRate / .5; // half second sample
        var arrayBuffer = context.createBuffer(channels, frameCount, context.sampleRate);

        var buffering = arrayBuffer.getChannelData(0);
        for (var i = 0; i < frameCount; i++) {
            buffering[i] = Math.random() * 2 - 1; // -1 to 1
        }

        // AudioBufferSourceNode.
        noiseBuffer = context.createBufferSource();
        noiseBuffer.buffer = arrayBuffer;
        noiseBuffer.loop = true;

        // filter properties
        noiseFilter = context.createBiquadFilter();
        noiseFilter.type = "bandpass";

        // gain properties       
        noiseGain = context.createGain();
        noiseGain.gain.setValueAtTime(0.0, context.currentTime);

        // connect nodes
        noiseBuffer.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(context.destination);

        // start!
        if (!noiseBuffer.start)
          noiseBuffer.start = noiseBuffer.noteOn;
        noiseBuffer.start(0);

    }

function Noise(xAccel, yAccel, zAccel) {
    console.log('called');

    var combinedAccel = xAccel + yAccel + zAccel;
    var amp = Math.min((combinedAccel / 25.0) * (combinedAccel / 25.0), 1.2);

    var decayTime = yAccel / 5.0;
    var filterFreq = Math.min(xAccel * 200.0 + 500.0, 7000);

    console.log('amp: ' + amp);
    console.log('decayTime: ' + decayTime);
    console.log('filterFreq: ' + filterFreq);

    // set up gain
    noiseGain.gain.setValueAtTime(amp, context.currentTime);
    noiseGain.gain.setTargetAtTime(0.0, context.currentTime, decayTime);

    // set up filter
    noiseFilter.frequency.setValueAtTime(filterFreq, context.currentTime);

};