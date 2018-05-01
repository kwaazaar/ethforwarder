
function doLoop(restart) {
    loopCount++;
    console.log('In timeout!');
    if (loopCount < 10) {
        restart();
    }
}

function restartLoop() {
    setTimeout(doLoop, 1000, restartLoop);    
}

var loopCount = 0;
restartLoop();

