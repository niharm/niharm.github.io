// CONSTANTS
var number_of_bell_oscillators = 3;

var bell_oscillators = []; 
var gains = [],
    freqRatios = [], 
    decays = [],
    amps = [];

var currentlyPlayingBell = false;

function getRandomInInterval(min, max) {
    return Math.random() * (max - min) + min;
}

function SetUpBells() {

    // randomly choose frequencies, gains, etc.
    var rand = Math.random();
    if (rand < 0.5) {
        freqRatios = [.5, 1.183, 2.0];
        amps = [.026, .394, .254];
        decays = [4.0, 1.2, .8];
    }
    else {
        freqRatios = [.5, 1.604, 3.620];
        amps = [.026, .015, .394];
        decays = [4.7, 2, 1.2];
    }

    // randomize decays a bit
    decayFactor = .5 + Math.random();
    console.log(decayFactor);
    for (var i = 0; i < decays.length; i++) {
        decays[i] = decayFactor * decays[i];
    };
    console.log(decays);


    for(var i = 0; i < number_of_bell_oscillators; i++) {
        var o = context.createOscillator();
        o.detune.value = getRandomInInterval(-4, +4); // random detuning

        // edge case
        if (!o.start)
          o.start = o.noteOn;
        o.start(0);

        var g = context.createGain();

        // connect nodes
        o.connect(g);

        g.gain.setValueAtTime(0.0, 0);
        g.connect(context.destination);

        bell_oscillators.push(o);
        gains.push(g);

    }
}

function Bell(bellFreq, xAccel, yAccel, zAccel) {

    var combinedAccel = xAccel + yAccel + zAccel;
    var gainMult = Math.min((combinedAccel / 30.0) * (combinedAccel / 30.0), 1.2);

    var attackTime = .01;

    for(var i = 0; i < number_of_bell_oscillators; i++) {
        
            o = bell_oscillators[i];
            g = gains[i];

            console.log(o);

            g.gain.linearRampToValueAtTime(amps[i] * gainMult, context.currentTime + attackTime);
            g.gain.linearRampToValueAtTime(0.0, context.currentTime + attackTime + decays[i]);

            console.log(bellFreq);
            o.frequency.setValueAtTime(freqRatios[i] * bellFreq, context.currentTime);

        };

    currentlyPlayingBell = true;
    setTimeout(function(){ 
        currentlyPlayingBell = false; 
    }, 250);

};

