// The Nature of Code
// Daniel Shiffman
// http://natureofcode.com

// Child class constructor
function Particle(position) {
  VerletParticle2D.call(this,position);

  // Override the display method
  this.display = function(){
    fill(255, 204, 0);
    stroke(255, 204, 0);
    ellipse(this.x,this.y,100,100);
  }
}

// Inherit from the parent class
Particle.prototype = Object.create(VerletParticle2D.prototype);
Particle.prototype.constructor = Particle;
