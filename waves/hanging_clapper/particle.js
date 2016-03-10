// The Nature of Code
// Daniel Shiffman
// http://natureofcode.com

// Child class constructor
function Particle(position) {
  VerletParticle2D.call(this,position);

  // Override the display method
  this.display = function(){
    fill(255);
    //stroke(200);
    //strokeWeight(2);
    ellipse(this.x,this.y,25,25);
  }
}

// Inherit from the parent class
Particle.prototype = Object.create(VerletParticle2D.prototype);
Particle.prototype.constructor = Particle;
