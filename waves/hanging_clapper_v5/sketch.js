// HANGING CLAPPER

var numOsc = 10;
var gains = [];
var oscs = [];
var doFirst = 1;
var bellRatios1 = [1, 2.002435312,	3.010045662,	4.007458143,	4.420091324,	5.047369863,	6.276712329,	7.221917808,	8.94261796,	9.578386606,	9.862557078,	11.15449011];
var bellRatios2 = [1,	2.004081633,	2.979591837,	3.191836097,	4.016326531,	5.481632653,	5.651020408,	7.242857143, 8.94, 9.5783, 9.86];
var bellRatios3 = [1,	3.836161616,	2.982626263,	3.989090909,	4.956565657,	5.114909091,	5.861090909,	5.971717172,	6.119191919,	7.353131313,	8.81769697,	9.288080808,	10.20363636];
var bellRatios4 = [1,	2.014130278,	3.038832555,	4.041629816,	6.063473128,	7.02811658,	9.459264896,	13.75964129, 14.76994591,	20.54032374,	25.86540241, 31.50825809];
var bellRatios5 = [1,	7.170425359,	11.39745326,	17.05662422,	20.99918721,	22.87401788,	29.49986454,	38.10132755,	40.89515037];
var bellRatios6 = [1,	1.499228216,	1.746473029,	2.067219917,	2.365767635,	2.653112033,	2.840248963,	2.989211618,	3.28340249,	3.851659751,	4.439834025];
var bellRatios7 = [1,	2.757972665,	3.745254366,	4.114654518,	5.012784738,	6.452287396,	6.866268033,	7.732536067,	10.14018603];
var bellRatios8 = [1,	1.996111471,	2.357096565,	3.918664938,	5.314322748,	5.867141931,	6.550226831,	8.102592353,	10.51198963];
var bellRatios9 = [1,	1.00963831,	1.036245117,	1.36603764,	1.543567696,	2.022629737,	2.072490235,	2.314189114,	3.002358849,	3.057550855];
var bellRatios10 = [1,	1.775485437,	1.998179612,	2.775637136,	3.775788835,	5.219356796,	5.557342233,	8.235740291,	11.73134102,	15.6403216];
var bellRatios11 = [1,	2.854926077,	5.158120088,	5.715599362,	6.165749508,	7.331513384,	9.329588069,	11.48392937,	13.94731246,	14.95107688,	16.73262547];
var bellRatios12 = [1,	1.762993568,	2.144635898,	2.932062538,	3.239940842,	3.450161979,	4.738485375,	5.067726184,	6.896978731];
var bellRatios13 = [1,	1.968132192,	1.997133583,	2.038865236,	2.064705138,	2.087678624,	2.132951144,	2.719597016,	4.005298655];
var bellRatios14 = [1, 1.005,	2.99,2.01,2.780258162,	5.2,5.226150342,	7.667122248,	8.240394837,	11.74047077,	15.65770691];

var fundamental = 220;
var randFreqs = [];
var bendSpeedSlow = 2.0;
var bendSpeedFast = 1.0;
var decayMax = .9;
var timeOfLastRing = 0;
var detune = .2;
var decay = 10;

var context;

// for circle waves
var maxCircles = 40;

var circles = [];
var p, acceleration;

var s = [];
var e = [];
var buffer = 1;
var i;

var bounciness = 0.1;
var sensitivity = 0.3;
var stiffness = 0.05;
var damping = 0.05;

var MAX_ANGLE;


function setup() {
  createCanvas(windowWidth,windowHeight);

  background(0);

  p = new Particle(width/2, height/2);
  acceleration = createVector(0, 0);

  initSound();

  //calculate maximum angle
  if (height < width) { MAX_ANGLE = 89; }// landscape orientation
  else {
    MAX_ANGLE = Math.asin((width/2)/(height*2/3)) * 180 / Math.PI;
  }
}

function draw() {

  background(0,50);

  p.steer(stiffness, damping);
  p.update(acceleration);
  p.display();

  drawCircles();

  // Move the second one according to the mouse
  if (mouseIsPressed) {
    p.theta = 90;
    p.velocity = 0;
    // add theta control
  }

  if (p.velocity < 0) {
    p.velocity += abs(accelerationX) * -1 * sensitivity; }
  else  {
    p.velocity += abs(accelerationX)* sensitivity; }

}

function collision() {
    ring(abs(p.velocity) / 500.0); // ring based on value of velocity
    p.velocity = -1*bounciness*p.velocity;
    circles.push([0,p.position.x,p.position.y,0,0]); // 0, position.x, position.y, circle_size, num_circles
}


function initSound(){

  // Fix up prefixing
window.AudioContext = window.AudioContext || window.webkitAudioContext;
context = new AudioContext();
  
  //create a random array of frequencies
  for (var i = 0; i < numOsc; i++) {
    
      randFreqs[i] = random(100, 12000);
  }
  
  //sort them lowest to highest
  randFreqs.sort(function(a,b){return a-b});
  //print(randFreqs);

  for (i = 0; i < numOsc; i++) {

    var o = context.createOscillator();
    o.frequency.value = randFreqs[i];
    o.detune.value = random(-4, +4); // random detuning

    var g = context.createGain();

    // connect nodes
    o.connect(g);
    g.gain.value = 0.0;
    //g.gain.value = (1.0 / ((numOsc) * 4));
    g.connect(context.destination);
    o.start(0);
    oscs.push(o);
    gains.push(g);
  }

}

// circle = [0, x, y, circleSize, numCircles]

function drawCircles(){
  for (var i = 0; i < circles.length; i++)
  {
    var thisCircle = circles[i];
    var circleSize = thisCircle[3];

    // calculate opacity based on number of circles so far
    var numCircles = thisCircle[4];
    var opacity = 1 - numCircles/maxCircles;

    if (numCircles < maxCircles)
    {
      // draw circle
      noFill();
      strokeWeight(3);
      var circleColor = 'rgba(155, 211, 221,' + opacity + ')';
      //console.log(circleColor);
      stroke(circleColor);
      ellipse(thisCircle[1], thisCircle[2], circleSize, circleSize);

      //increment next version
      circles[i][3] += (width / 15);
      ++circles[i][4];
    }
    else
    {
      circles.splice(i,1);
    }
  } 
}

function ring(amplitude)
{
  var timeSinceLastRing = (context.currentTime - timeOfLastRing);
  
  if (timeSinceLastRing > 0.1)
  {
    //ring the bell, using an amplitude based on the velocity
    for (var i = 0; i < numOsc; i++) 
    {
      //ramp up to the amplitude of the harmonic quickly (within 7ms)
      gains[i].gain.setTargetAtTime((random(0.0000001,(amplitude *(1.0/numOsc)))), context.currentTime, 0.0001);
      //ramp down to almost zero (non-zero to avoid divide by zero in exponential function) over the decay time for the harmonic
      gains[i].gain.setTargetAtTime(0.0000001, (context.currentTime+.015), random(0.00001, decayMax));
    }
  }
  timeOfLastRing = context.currentTime;
}


window.addEventListener('touchstart', function() 
{
  counter = 0;
  if (doFirst) {
    myNoise = context.createOscillator('Noise');
    myNoise.start(0);
    myNoise.disconnect();
  }

  // this stuff is to avoid tuning issues caused by 48k vs 44.1k sample rates
  var playInitSound = function playInitSound() {
      var source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, 48000);
      source.connect(context.destination);
      if (source.start) {
          source.start(0);
      } else {
          source.noteOn(0);
      }
  };
  playInitSound();
  if (context.sampleRate === 48000) {
      context = new AudioContext();
      playInitSound();
  } 

}, false);


//this function will force the random bell to glissando into a tuned bell.
function sweep()
{
  //roll dice for octave
  var octave = pow(2,(round(random(0,3))));
  print(octave);
  
  //roll dice for which bell overtone series
  var whichBell = round(random(0,13));
  print(whichBell);
  
  // now adjust the overtones to match the chosen bell
  for (var i = 0; i < numOsc; i++) 
  {
    if (whichBell === 0)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios1[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 1)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios2[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 2)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios3[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 3)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios4[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 4)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios5[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 5)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios6[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 6)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios7[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 7)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios8[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 8)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios9[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 9)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios10[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 10)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios11[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 11)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios12[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 12)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios13[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    else if (whichBell == 13)
    {
      oscs[i].frequency.setTargetAtTime((bellRatios14[i] * fundamental * octave), 0.0, random(bendSpeedFast, bendSpeedSlow));
    }
    
    oscs[i].detune.value = random(-0, +0); // random detuning
  }
}
