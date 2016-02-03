// patch
SinOsc s => dac;

// gain
.4 => s.gain;

me.arg(0) => string test_string;
me.arg(0) => int input;

220 + input * 10 => float freq;
freq => s.freq;

.5::second => now;
