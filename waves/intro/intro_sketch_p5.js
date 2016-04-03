var introSketch = function(s) {

  var width, height;

  s.setup = function() {

    s.createCanvas(s.windowWidth, s.windowHeight);
    s.background(40);
    width = s.width;
    height = s.height
    s.textSize(width/10); // TODO: set maximum here
    s.fill('white');
    s.textAlign(s.CENTER);
    s.text('where are you?', width/2,height/4);


    s.fill('red');
    s.quad(2*width/8, height/3, 3*width/8,height/3, 2*width/6, 2*height/3, width/6, 2*height/3)
    s.fill('green');
    s.quad(3*width/8, height/3, 4*width/8,height/3, 3*width/6, 2*height/3, 2*width/6, 2*height/3)
    s.fill('blue');
    s.quad(4*width/8, height/3, 5*width/8,height/3, 4*width/6, 2*height/3, 3*width/6, 2*height/3)
    s.fill('yellow');
    s.quad(5*width/8, height/3, 6*width/8,height/3, 5*width/6, 2*height/3, 4*width/6, 2*height/3)

  };

  s.draw = function() {
    s.fill(0);
  };

  s.touchStarted = function() {
    // empty to make sure screen won't be pulled around
  };

  s.touchEnded = function() {

    if ((s.touchY > height/3) && (s.touchY < 2*height/3)) {

      if ((s.touchX > width/6) && (s.touchX < 2*width/6)) {
        s.background('red'); 
      }

      else if ((s.touchX > 2*width/6) && (s.touchX < 3*width/6)) {
        s.background('green'); 
      }

      else if ((s.touchX > 3*width/6) && (s.touchX < 4*width/6)) {
        console.log(3*width/6);
        s.background('blue'); 
      }

      else if ((s.touchX > 4*width/6) && (s.touchX < 5*width/6)) {
        s.background('yellow'); 
      }
    }
  };

};

var p5_intro = new p5(introSketch);
