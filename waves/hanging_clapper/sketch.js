// Spring tied to center of screen, making sound when it hits the walls.

var physics;
var p = [];
var spring = [];
var ball;
var spacing = 200;
var speedX = 0;
var speedY = 0;
var s = [];
var e = [];
var circles = [];
var buffer = 1;
var bellPitches = [60.0, 63.0, 67.0, 72.0];
var numOsc = 2;
//var bellOvertones = [1.0, 3.07, 7.279,9.405,13.505];
//var bellOvertones = [1.0, 3.07, 3.6624, 7.279,9.405,13.505];
var bellOvertones = [1.0, 7.279,9.405,13.505];
var i;
var currentVelX = 0;
var currentVelY = 0;
var calcVelX = 0;
var calcVelY = 0;
var detune = .2;
var decay = 10;

function setup() {
  createCanvas(windowWidth,windowHeight);

  //myNoise = new p5.Noise();
  //myNoise.start();
  
  for (j = 0; j < bellPitches.length; j++)
  {
    s[j] = [];
    e[j] = [];
    for (i = 0; i < numOsc; i++)
    {
      s[j][i] = new p5.SinOsc();
      s[j][i].amp(0);
      s[j][i].start();
      e[j][i] = new p5.Env(0.01, 0.5, 1, 0.5);
      e[j][i].setADSR(.01,2,0,0.1);
      e[j][i].setExp(true);
      s[j][i].freq(midiToFreq((bellPitches[j] + (random((detune*-1.0), detune)))) * bellOvertones[i]);
      // TEMP: make them all the same pitch
      s[j][i].freq(midiToFreq(bellPitches[0] * bellOvertones[i]));
    }
  }
  textSize(windowHeight/10);
  textAlign(CENTER, CENTER);

  // Initialize the physics
  physics = new VerletPhysics2D();
  physics.addBehavior(new GravityBehavior(new Vec2D(0,10)));

  // Set the world's bounding box
  physics.setWorldBounds(new Rect(0,0,width,height));
  
  // Make two particles
  /*
  p[0] = new Particle(new Vec2D(width/2,0));
  p[1] = new Particle(new Vec2D(width,height/2));
  p[2] = new Particle(new Vec2D(width/2,height));
  p[3] = new Particle(new Vec2D(0,height/2));
  */

  p[0] = new Particle(new Vec2D(width/2,0));

  ball = new Particle(new Vec2D(width/2,height/2));
  // Lock one in place
  p[0].lock();

  // Make a spring connecting both Particles
  spring[0] = new VerletSpring2D(p[0],ball,height*(2/3),1);

  // Anything we make, we have to add into the physics world
  physics.addParticle(p[0]);
  physics.addParticle(ball);
  physics.addSpring(spring[0]);
}

function draw() {

  background(50);

  // Update the physics world
  physics.update();
  
  if (ball.x < buffer) 
  {
    collision(0, ball.x, ball.y, ball.getVelocity());
  }
  else if (ball.y < buffer)
  {
    collision(1, ball.x, ball.y,ball.getVelocity());
  }
  else if (ball.x > (width - buffer))
  {
    collision(2, ball.x, ball.y,ball.getVelocity());
  }
  else if (ball.y > (height - buffer))
  {
    collision(3, ball.x, ball.y,ball.getVelocity());
  }
  
  // Draw a line between the particles
  
  

  
  for (var i = 0; i < circles.length; i++)
  {
    var thisCircle = circles[i];
    var circleSize = thisCircle[5];
    var circleWall = thisCircle[0];
    if (circleSize < (sqrt(2) * width *2))
    {
      noFill();
      strokeWeight(5 );
      if (circleWall == 0)
      {
        stroke('#5F08FF');
      }
      else if (circleWall == 1)
      {
        stroke('#5F08FF');
      }
      else if (circleWall == 2)
      {
        stroke('#5F08FF');
      }
      else if (circleWall == 3)
      {
        stroke('#5F08FF');
      }
      ellipse(thisCircle[1], thisCircle[2], circleSize, circleSize);
      circles[i][5] += (windowWidth / 10);
    }
    else
    {
      circles.splice(i,1);
    }
  }
  
  
  stroke(255, 242, 8);
  strokeWeight(100);
  line(p[0].x,p[0].y,ball.x,ball.y);
  
  /*
  line(p[1].x,p[1].y,ball.x,ball.y);
  line(p[2].x,p[2].y,ball.x,ball.y);
  line(p[3].x,p[3].y,ball.x,ball.y);
  */

  // Display the ball
  ball.display();
  
  // Move the second one according to the mouse
  
  if (mouseIsPressed) {
    ball.x = mouseX;
    ball.y = mouseY;
  }
  

  if (abs(accelerationX - pAccelerationX) + abs(accelerationY - pAccelerationY) > 30) {
    ball.x += accelerationX*10;
    ball.y += accelerationY*10;
  }
  /*
  fill(255);
  noStroke();
  text("velocity X: "+str(round(currentVelX)), width/2,3*height/4);
  text("velocity Y: "+str(round(currentVelY)), width/2,1*height/4);
  */
}

function collision (wall,x,y,velocity)
{
  currentVelX = velocity.x;
  currentVelY = velocity.y;
  currentVelTotal = (abs(currentVelX) + abs(currentVelY));
  for (i = 0; i < numOsc; i++)
  {
    e[wall][i].setADSR(0.01, random(.6, (decay / (i+1))), 0.0, 0.1);
    e[wall][i].setRange(random(0.01, (map(currentVelTotal, 0, 600, 0.01, 1.0) * .33)));
    //e[i].setRange((random(0.01, (1/(i+1)))) * .5);
    e[wall][i].play(s[wall][i], 0);
  }
  circles.push([wall,x,y,velocity.x, velocity.y,0]);
}
