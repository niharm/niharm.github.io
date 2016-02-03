// CONSTANTS
var number_of_oscillators = 3;
var oscillators = []; 
var gains = [];

function SetUpSaw() {
    for(var i = 0; i < number_of_oscillators; i++) {
        var o = context.createOscillator();

        // edge case
        if (!o.start)
          o.start = o.noteOn;
        o.start(0);

        var g = context.createGain();

        // connect nodes
        o.connect(g);
        g.connect(context.destination);
       
        g.gain.setValueAtTime(0.0, context.currentTime);
        o.type = 'sawtooth';

        oscillators.push(o);
        gains.push(g);

        console.log('setting up');

    }
}


function Saw(note) {

  function playsound(note) {
        var amp = 1.0;
        var detunings = [0, -7, +7]
        var attackTime = .5;
        var decay = .4;

    for(var i = 0; i < number_of_oscillators; i++) {

            console.log('here');
            
            o = oscillators[i];
            g = gains[i];

            o.frequency.setValueAtTime(midiToFreq(note), 0.0);
            o.detune.value = detunings[i];

            // set up gain
            g.gain.setValueAtTime(0.0, context.currentTime);
            g.gain.setTargetAtTime(amp, context.currentTime, attackTime);
            g.gain.setTargetAtTime(0.0, context.currentTime + attackTime, decay);


           // https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode

        };

    }

    playsound(note);
};