var io =
  { fetch_block: function (mem, start, size) {
      return mem.slice(start, start+size) }
  }
var tape_unit =
  { head: 0
  , blocks: []
  , status: 'ready'
  , ioc: function (inst) { // still needs testing
      var M = inst.get_M()
      if (M) {
          tape_unit.head += M
          if (tape_unit.head < 0) tape_unit.head = 0 }
      else tape_unit.head = 0 }
  , io_in: function (inst) {}
  , io_out: function (inst) {}
  }

/**
 * can eventually make an IO device prototype that allows timing delays and
 * device 'busy' statuses to be emulated.
 */
var line_printer =
  { status: 'ready'
  , io_ioc: function () { this.write_to.className = 'printer_paper' }
  , io_in: function () { throw { name: "DeviceError:NotAnInputDevice" } }
  , io_out: function (mem, start) {
      var i, len, j, word
        , out_str= ''
        , words= io.fetch_block(mem, start, 24)
      for (i= 0, len= words.length; i < len; i+= 1) {
        word= words[i]
        for (j=1; j < 6; j+= 1) {
          out_str+= character_codes[word[j]] } }
      this.write_line(out_str)
    }
  , write_line: function (str) { // This needs to become faster!
      var new_write_to= this.write_to.cloneNode(true)
      new_write_to.textContent+= str + '\n'
      this.write_to.parentNode.replaceChild(new_write_to, this.write_to)
      this.write_to = new_write_to
      /* this.write_to.innerHTML += str + '<br />' */
    }
  , set_output: function (pre) {
      this.write_to = pre
    }
  }
var character_codes = [
  ' ','A','B','C','D','E','F','G','H','I', //0-9
  'Δ','J','K','L','M','N','O','P','Q','R', //10-19
  'Σ','Π','S','T','U','V','W','X','Y','Z', //20-29
  '0','1','2','3','4','5','6','7','8','9', //30-39
  '.',',','(',')','+','-','*','/','=','$', //40-49
  '<','>','@',';',':',"'"                  //50-55
]
var inverse_char_codes = (function () {
  var obj= {}
  character_codes.forEach(function (elt, index) {
    obj[elt]= index
  })
  return obj
})()
var lookup_char_code = function (char) {
  return inverse_char_codes[char]
}
/*
character_codes[0] = '&nbsp;'
character_codes[50] = '&lt;'
character_codes[51] = '&gt;'
*/
