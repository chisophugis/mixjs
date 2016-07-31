templates =
  { full_reg: (function () {
      var i
        , template= document.createElement('tr')
      for (i= 0; i < 7; i+= 1) {
        template.appendChild(document.createElement('td')) }
      return template
    })()
  , small_reg: (function () {
      var i
        , template= document.createElement('tr')
        , colspanning= document.createElement('td')
      for (i= 0; i < 4; i+= 1) {
        template.appendChild(document.createElement('td')) }
      colspanning.colSpan= 3
      template.appendChild(colspanning)
      return template
    })()
  , mem_word: (function () {
      var i
        , template= document.createElement('tr')
      template.className= 'mix_word'
      for (i= 0; i < 7; i+= 1) {
        template.appendChild(document.createElement('td')) }
      return template
    })()
  }

var gen_table = function (old_tbody, mix_memory, inst_pointer) {
  var new_tbody= old_tbody.cloneNode(false)
  mix_memory.forEach( function (word, index) {
    var i
      , tr= templates.mem_word.cloneNode(true)
      , children= tr.children
    if (index === inst_pointer) tr.style.backgroundColor = '#f9869f'
    children[0].textContent= index
    children[1].textContent= (word[0] === 1) ? '+' : '-'
    for (i=2; i < 7; i+= 1) children[i].textContent= word[i-1]
    this.appendChild(tr)
  }, new_tbody)
  document.getElementById('mem_tab')
          .replaceChild(new_tbody, old_tbody)
}

var full_reg_to_DOM = function (name, word) {
  var i
    , ret= templates.full_reg.cloneNode(true)
  ret.children[0].textContent= name
  ret.children[1].textContent= (word[0] === 1) ? '+' : '-'
  for (i= 2; i < 7; i+= 1) ret.children[i].textContent= word[i-1]
  return ret
}

var small_reg_to_DOM = function (name, word) {
  var ret= templates.small_reg.cloneNode(true)
  ret.children[0].textContent= name
  ret.children[1].textContent= (word[0] === 1) ? '+' : '-'
  ret.children[2].textContent= word[4]
  ret.children[3].textContent= word[5]
  return ret
}

var indicator_to_DOM = function (name, value) {
  var li= document.createElement('li')
  li.textContent= name + ': ' + value
  return li
}

// The global mix object
var glob_mix

var display_memory = function () {
  gen_table( document.getElementById('mem_cells')
           , glob_mix.mem
           , glob_mix.proc.inst_pointer
           )
}

// UGLY!
var display_proc = function () {
  var prop
    , proc= glob_mix.proc
    , old_regs= document.getElementById('registers')
    , new_regs= old_regs.cloneNode(false)
    , new_small_regs= document.createDocumentFragment()
    , old_indicators= document.getElementById('indicators')
    , new_indicators= old_indicators.cloneNode(false)
  for (prop in proc) {
    switch ( prop.slice(0,2) ) {
      case 'rA': case 'rX':
        new_regs.appendChild(full_reg_to_DOM(prop, proc[prop])) ;break
      case 'rI': case 'rJ':
        new_small_regs.appendChild(small_reg_to_DOM(prop, proc[prop])) ;break
      default:
        new_indicators.appendChild(indicator_to_DOM(prop, proc[prop])) ;break
    }
  }
  new_regs.appendChild(new_small_regs)
  old_regs.parentNode
          .replaceChild(new_regs, old_regs)
  old_indicators.parentNode
                .replaceChild(new_indicators, old_indicators)
}

var read_in_asm = function () {
  var asm_src= document.getElementById('asm_src')
  return asm_src.value
                .split('\n')
                .filter(function (line) {
                          return /^[^*]/.test(line)
                       })
                .map(function (line) {
                   var token_ary= line.split(/\s+/)
                   if (token_ary[1] === 'ALF') { // Need verbatim text for ALF
                     token_ary[2]= /ALF(?:  | (?=\S))(.{5})/.exec(line)[1] }
                   if (token_ary[1] === 'CHAR' || token_ary[1] === 'HLT') {
                     token_ary[2]= "0" }
                   return { LOC: token_ary[0]
                          , OP: token_ary[1]
                          , ADDRESS: token_ary[2]
                          }
                })
}


var assemble_src = function () {
  var ctx = assemble_line_objs(read_in_asm())
  glob_mix = new Mk_mix({ proc_spec: { inst_pointer: ctx.inst_pointer } })
  glob_mix.mem = ctx.mem_ary
  glob_mix.devices[18] = line_printer
  display_memory()
  display_proc()
}

document.getElementById('complete_button')
        .addEventListener( 'click'
                         , function () {
                             var throttled = function () {
                               var i
                               for (i= 0;
                                    i < 1000 && glob_mix.not_halted;
                                    i+= 1) { glob_mix.cycle() }
                               display_proc()
                               if (glob_mix.not_halted) {
                                 setTimeout(throttled, 30) } }
                             throttled() }
                         , false)

document.getElementById('assemble_button')
        .addEventListener( 'click'
                         , function () {
                             glob_mix.not_halted = false
                             setTimeout(assemble_src, 50) }
                         , false)

document.getElementById('cycle_button')
        .addEventListener( 'click'
                         , function (e) {
                             glob_mix.cycle()
                             display_memory()
                             display_proc() }
                         , false)

/* kept in case they're needed again

document.getElementById('redraw_button')
        .addEventListener( 'click'
                         , function () {
                             display_proc()
                             display_memory() }
                         , false)
*/
