var code;

code = "// patch\nSinOsc s => dac;\n// gain\n.4 => s.gain;\n\n// call chirp\nchirp( 127, 20, 1::second );\n\n// call chirp (with tinc)\nchirp( 20, 120, 1.5::second, 100::ms );\n\n// chirp function\nfun void chirp( float src, float target, dur duration )\n{\n    chirp( src, target, duration, 1::ms );\n}\n\n// chirp function (with tinc)\nfun void chirp( float src, float target, dur duration, dur tinc )\n{\n    // initialize freq\n    src => float freq;\n    // find the number of steps\n    duration / tinc => float steps;\n    // find the inc\n    ( target - src ) / steps => float inc;\n    // counter\n    float count;\n\n    // do the actual work over time\n    while( count < steps )\n    {\n        // increment the freq\n        freq + inc => freq;\n        // count\n        1 +=> count;\n\n        // set the freq\n        Std.mtof( freq ) => s.freq;\n\n        // advance time\n        tinc => now;\n    }\n}";
