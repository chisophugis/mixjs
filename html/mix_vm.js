/**
 * error reporting.
 *
 * types of errors:
 *    1. instruction register messing (SIZEERROR)
 *    2. invalid address (ADDRERROR)
 *    3. index field of instruction too big (INDEXERROR)
 *    4. illegal field specification (FERROR)
 *
 * Quote:
 * Have an error code for everything. By simply knowing the error code, you
 * should be able to find the location in your code where that error was
 * signaled.
 */

// just templates for what the 'validate' functions throw (for now)
var err =
  { field: { name: "FieldError"
           , message: "Not a valid L:R specification"
           }
  , division: { name: "DivisionError"
              , message: "Divided by 0 or |rA| >= |V|"
              }
  , invalid_word: { name: "InvalidWordError"
                  , message: "This is not a valid mix word"
                  }
  , parse_error: { name: "ParseError"
                 , message: "There was a problem parsing your expression"
                 }
  }

// these 'validate' functions are the only ones that throw errors from
// inside the guts of the machine
var validate =
  { field: function (raw_field) {
      var L= Math.floor(raw_field /8)
        , R= (raw_field %8)
      if (0 <= L && L <= R && R <= 5) return
      else throw { name: "FieldError"
                 , message: "(" + L + ":" + R + "): "
                                + "Not a valid L:R specification"
                 , payload: { L: L, R: R }
                 }
      }
  , division: function (rA_num, V_num) {
      if (rA_num >= V_num || V_num === 0) {
        throw { name: "DivisionError"
              , message: "V === 0 or |rA| >= |V|"
              , payload: { rA: rA_num, V: V_num }
              }
      } }
  , device_present: function (inst) {
      if ( !inst.devices[inst.field] ) {
        throw { name: "RuntimeError:DeviceNotFound" } }
      else return true }
 }

var util =
  { word2num: function (word) {
      var i, num
      for (i= 1, num= 0; i <= 5;  i+= 1) num= (num<<6) + word[i]
      return word[0] * num }
  , num2word: function (number) {
      var i
        , sign= (number >>> 31) ? (-1) : 1
        , word= [sign,0,0,0,0,0]
      for (i= 5, number= Math.abs(number); i; i-= 1) {
        word[i]= number & 0x3F
        number= number >> 6 }
      return word }
  , check_overflow: function (num) {
      return (Math.log(Math.abs(num))/Math.LN2 >= 30) }
  , extract_field: function (word, raw_field) {
      var L= Math.floor(raw_field /8)
        , R= (raw_field %8)
        , result= word.slice( (L || 1), (R +1) )
      while (result.length < 5) result.unshift(0)
      result.unshift( L ? 1 : word[0] )
      return result }
  , insert_field_into: function (from_word, to_word, raw_field) {
      var i
        , offset
        , L= Math.floor(raw_field /8)
        , R= raw_field %8
      if (L === 0) to_word[0] = from_word[0]
      for (i= (L || 1), offset= (5 - R); i <= R; i+= 1) {
        to_word[i] = from_word[i+offset] } }
  }

// TODO write unit tests for each of the gut functions

// could define guts in a closure with "var num2word= util.num2word"
// and such for most of the util functions, so that we don't constantly
// have to be saying util.whatever. This will also make it faster.
var guts =
  { no_op: function (inst) { inst.proc.u_elapsed += 1 } // opcode 0 (NOP)
  , add_or_sub: function (inst) { // opcodes 1,2 (ADD, SUB)
      var num1= util.word2num(inst.proc.rA)
        , num2= util.word2num(inst.get_V())
        , sum_or_diff= num1 + (inst.opcode === 1 ? num2 : (-num2))
      if (util.check_overflow(sum_or_diff)) {
        inst.proc.ovtog = true }
      inst.proc.rA = util.num2word(sum_or_diff)
      inst.proc.u_elapsed += 2 }
  , mul: function (inst) { // opcode 3 (MUL)
      var i                // TODO fix known bug with precision
        , num1= util.word2num(inst.proc.rA)
        , num2= util.word2num( inst.get_V() )
        , result= num1 * num2
        , sign= (number >>> 31) ? (-1) : 1
        , double_wide= [0,0,0,0,0,0,0,0,0,0]
      for (i= 9, result= Math.abs(result); i > 0; i-= 1) {
        double_wide[i]= result %64
        result= Math.floor(result /64) }
      inst.proc.rA = [ sign ].concat(double_wide.slice(0,5))
      inst.proc.rX = [ sign ].concat(double_wide.slice(5))
      inst.proc.u_elapsed += 10 }
  , div: function (inst) { // opcode 4 (DIV)
      var V= inst.get_V()  // TODO fix known bug with precision
        , V_num= Math.abs(util.word2num(V))
        , rA_num= Math.abs(util.word2num(inst.proc.rA))
        , rX_num= Math.abs(util.word2num(inst.proc.rX))
        , numerator= rA_num*Math.pow(2,30) + rX_num
        , quotient= V[0]*inst.proc.rA[0] * Math.floor(numerator / V_num)
        , remainder= inst.proc.rA[0] * (Math.abs(numerator) % Math.abs(V_num))
      if (rA_num >= V_num) inst.proc.ovtog = true
      inst.proc.rA = util.num2word(quotient)
      inst.proc.rX = util.num2word(remainder)
      inst.proc.u_elapsed += 12 }
  , to_num: function (inst) { // opcode 5, field 0 (NUM)
      var reg_a_word
        , double_wide= inst.proc.rA.slice(1,6).concat(inst.proc.rX.slice(1,6))
        , digit_str= double_wide.map(function (digit_char) {
                                       return (digit_char %10) } )
                                .join('')
      if (util.check_overflow(digit_str)) {
        inst.proc.ovtog = true
        digit_str%= Math.pow(2,30) }
      reg_a_word= util.num2word(digit_str)
      reg_a_word.splice(0, 1, inst.proc.rA[0])
      inst.proc.rA = reg_a_word
      inst.proc.u_elapsed += 10 }
  , to_char: function (inst) { // opcode 5, field 1 (CHAR)
      var num= Math.abs(util.word2num(inst.proc.rA))
        , double_wide= num.toString(10)
                          .split('')
                          .map(function (digit_char) {
                                 return (+digit_char) + 30 } )
      while (double_wide.length < 10) double_wide.unshift(30)
      inst.proc.rA = [ inst.proc.rA[0] ].concat(double_wide.slice(0, 5))
      inst.proc.rX = [ inst.proc.rX[0] ].concat(double_wide.slice(5,10))
      inst.proc.u_elapsed += 10 }
  , halt: function (inst) { // opcode 5, field 2 (HLT)
      // total kluge, but I don't care what happens when MIX is *off*, so
      // long as it stays put.
      // This will be fixed on the next refactoring.
      glob_mix.not_halted = false // this controls the "Run to Completion" loop
      inst.proc.inst_pointer -= 1 // stay on this instruction
      display_memory()
      alert("MIX has halted")
      display_proc() }
  , shift_a: function (inst) { // opcode 6, fields 0,1 (SLA, SRA)
      var i
        , signless_new_rA
        , filler_zeros= []
        , rA_word= inst.proc.rA
        , times= inst.get_M()
        , slice_len= 5 - times
      if (times > 4) {
        inst.proc.rA = [ rA_word[0] ].concat([0,0,0,0,0])
        inst.proc.u_elapsed += 2
        return }
      for (i= 0; i < times; i+= 1) filler_zeros.push(0)
      if (inst.field %2) {
        signless_new_rA= filler_zeros.concat(rA_word.slice(1, 1+slice_len)) }
      else {
        signless_new_rA= rA_word.slice(6-slice_len, 6).concat(filler_zeros) }
      inst.proc.rA = [ rA_word[0] ].concat(signless_new_rA)
      inst.proc.u_elapsed += 2 }
  , shift_ax: function (inst) { // opcode 6, fields 2,3 (SLAX, SRAX)
      var i
        , filler_zeros= []
        , rA_word= inst.proc.rA
        , rX_word= inst.proc.rX
        , double_wide= rA_word.slice(1,6).concat( rX_word.slice(1,6) )
        , times= inst.get_M()
        , slice_len= 10 - times
      if (times > 9) {
        inst.proc.rA = [ rA_word[0] ].concat([0,0,0,0,0])
        inst.proc.rX = [ rX_word[0] ].concat([0,0,0,0,0])
        inst.proc.u_elapsed += 2
        return }
      for (i= 0; i < times; i+= 1) filler_zeros.push(0)
      if (inst.field %2) { // shifting right (odd) or left (even)?
        double_wide= filler_zeros.concat(double_wide.slice(0, slice_len)) }
      else {
        double_wide= double_wide.slice(10-slice_len, 10).concat(filler_zeros) }
      inst.proc.rA = [ rA_word[0] ].concat(double_wide.slice(0,5))
      inst.proc.rX = [ rX_word[0] ].concat(double_wide.slice(5,10))
      inst.proc.u_elapsed += 2 }
  , shift_ax_circular: function (inst) { // opcode 6, fields 4,5 (SLC, SRC)
      var rA_word= inst.proc.rA
        , rX_word= inst.proc.rX
        , double_wide= rA_word.slice(1,6).concat( rX_word.slice(1,6) )
        , times= inst.get_M() %10
        , shift_chunk= double_wide.splice(
              (inst.field %2) ? (10-times) : (times) )
        , shifted_result= shift_chunk.concat(double_wide)
      inst.proc.rA = [ rA_word[0] ].concat(shifted_result.slice(0,5))
      inst.proc.rX = [ rX_word[0] ].concat(shifted_result.slice(5,10))
      inst.proc.u_elapsed += 2 }
  , move: function (inst) { // opcode 7 (MOVE)
      var i
        , how_many= inst.field
        , from= inst.get_M()
        , to= util.word2num(inst.proc.rI1)
      for (i= 0; i < how_many; i+= 1) inst.mem[to+i] = inst.mem[from+i].slice()
      inst.proc.rI1 = util.num2word(to + how_many)
      inst.proc.u_elapsed += (1 + (2*inst.field)) }
  , load: function (inst) { // opcodes 8-15 (LD?), 16-23 (LD?N)
      var pos_or_neg= ( Math.floor(inst.opcode /8) === 2 ) ? (-1) : 1
        , to_load= inst.get_V()
      to_load[0]*= pos_or_neg
      inst.proc[inst.reg()] = to_load
      inst.proc.u_elapsed += 2 }
  , store: function (inst) { // opcodes 24-31 (ST?), 32 (STJ), 33 (STZ)
      var M= inst.get_M()
        , to_mem_cell = inst.mem[M] || (inst.mem[M] = [1,0,0,0,0,0])
        , from_reg = inst.proc[inst.reg()] || /* STZ */ [1,0,0,0,0,0]
      util.insert_field_into(from_reg, to_mem_cell, inst.field)
      inst.proc.u_elapsed += 2 }
  , io_jump: function (inst) { // opcodes 34 (JBUS), 38 (JRED)
      validate.device_present(inst)
      if ( inst.devices[inst.field].status
           === ( inst.opcode === 34 ? 'busy' : 'ready' )
         ) {
        inst.proc.rJ = util.num2word(inst.proc.inst_pointer)
        inst.proc.inst_pointer = inst.get_M() }
      inst.proc.u_elapsed += 1 }
  , io_ioc: function (inst) { // opcode 35 (IOC)
      validate.device_present(inst)
      inst.devices[inst.field].io_ioc(inst.get_M())
      inst.proc.u_elapsed += 1 }
  , io_out: function (inst) { // opcode 37 (OUT)
      validate.device_present(inst)
      inst.devices[inst.field].io_out(inst.mem, inst.get_M())
    }
  , jump: function (inst) { // opcode 39, fields 0-9 (J*)
      var test
        , proc= inst.proc
      switch (inst.field) {
        case 0: test= true                ;break    // JMP
        case 1: test= true                ;break    // JSJ
        case 2: test= proc.ovtog          ;break    // JOV
        case 3: test= !proc.ovtog         ;break    // JNOV
        case 4: test= proc.compi === (-1) ;break    // JL
        case 5: test= proc.compi === 0    ;break    // JE
        case 6: test= proc.compi === 1    ;break    // JG
        case 7: test= proc.compi !== (-1) ;break    // JGE
        case 8: test= proc.compi !== 0    ;break    // JNE
        case 9: test= proc.compi !== 1    ;break }  // JLE
      if (test) {
        if (inst.field !== 1) proc.rJ = util.num2word(proc.inst_pointer) // JSJ
        proc.inst_pointer = inst.get_M() }
      inst.proc.u_elapsed += 1 }
  , reg_jump: function (inst) { // opcodes 40-47, fields 0-5 (J?+)
      var test
        , proc= inst.proc
        , num= util.word2num(proc[inst.reg()])
      switch (inst.field) {
        case 0: test= (num < 0)     ;break    // J?N
        case 1: test= (num === 0)   ;break    // J?Z
        case 2: test= (num > 0)     ;break    // J?P
        case 3: test= (num >= 0)    ;break    // J?NN
        case 4: test= (num !== 0)   ;break    // J?NZ
        case 5: test= (num <= 0)    ;break }  // J?NP
      if (test) {
        proc.rJ = util.num2word(proc.inst_pointer)
        proc.inst_pointer = inst.get_M() }
      inst.proc.u_elapsed += 1 }
  , inc_or_dec: function (inst) { // opcodes 48-55, field 0,1 (INC?, DEC?)
      var amt= inst.get_M() * (inst.field === 0 ? 1 : (-1))
      inst.proc[inst.reg()] = util.num2word(
          amt + util.word2num(inst.proc[inst.reg()]) )
      inst.proc.u_elapsed += 1 }
  , ent_or_enn: function (inst) { // opcodes 48-55, field 2,3 (ENT?, ENN?)
      var result_word= util.num2word( inst.get_M() )
      result_word[0]*= (inst.field === 2 ? 1 : (-1))
      inst.proc[inst.reg()] = result_word
      inst.proc.u_elapsed += 1 }
  , reg_cmp: function (inst) { // opcodes 56-63 (CMP?)
      var reg= util.word2num( inst.proc[inst.reg()] )
        , mem_cell= util.word2num( inst.get_V() )
        , diff= reg - mem_cell
      inst.proc.compi = diff && (diff / Math.abs(diff))
      inst.proc.u_elapsed += 2 }
  }

var inst_augmentation_table =
  { 0: function (inst) {
      switch (inst.opcode) {
        case 0: inst['exec'] = guts.no_op ;break
        case 1: case 2: inst['exec'] = guts.add_or_sub ;break
        case 3: inst['exec'] = guts.mul ;break
        case 4: inst['exec'] = guts.div ;break
        case 5: inst['exec'] = [ guts.to_num
                               , guts.to_char
                               , guts.halt
                               ][inst.field] ;break
        case 6: inst['exec'] = [ guts.shift_a
                               , guts.shift_ax
                               , guts.shift_ax_circular
                               ][Math.floor(inst.field /3)] ;break
        case 7: inst['exec'] = guts.move ;break } }
  , 1: function (inst) {
      inst['exec'] = guts.load }
  , 2: function (inst) {
      inst['exec'] = guts.load }
  , 3: function (inst) {
      inst['exec'] = guts.store }
  , 4: function (inst) {
      switch(inst.opcode) {
        case 32: case 33: this['3'](inst) ;break
        case 34: case 38: inst['exec'] = guts.io_jump ;break
        case 35: inst['exec'] = guts.io_ioc ;break
        case 37: inst['exec'] = guts.io_out ;break
        // TODO IO devices
        case 39: inst['exec'] = guts.jump ;break } }
  , 5: function (inst) {
      inst['exec'] = guts.reg_jump }
  , 6: function (inst) {
      switch (inst.field) {
        case 0: case 1: inst['exec'] = guts.inc_or_dec ;break
        case 2: case 3: inst['exec'] = guts.ent_or_enn ;break } }
  , 7: function (inst) {
      inst['exec'] = guts.reg_cmp }
  }

/**
 * mk_mem
 *
 * Memory.prototype will have:
 * get_mem_range(start, end [, representation])
 * get_mem_word(loc) ???
 *
 * The constructor is passed an object of the form:
 * { <org1>: [word, word, ...]
 * , <org2>: [word, word, ...]
 * }
 * Example:
 * { 3500: [word, word, ...]
 * , 3750: [word, word, ...]
 * }
 * will set mem starting at cell 3500 with the contents of the first mem
 * chunk. Then starting at cell 3750 the contents of the next chunk.
 *
 */

var mk_mem = function (mem_spec) {
  var i
    , orig
    , mem_region
    , new_mem= []
  for (orig in mem_spec) {
    i= (+orig)
    mem_region= mem_spec[orig]
    while (mem_region.length) new_mem[i++] = mem_region.shift() }
  return new_mem
}

/**
 * mk_proc
 *
 * The constructor is passed an object literal containing any number of the
 * properties of a complete proc object. The constructor then finds all of
 * the defined properties and creates a new object with them, filling in
 * the unefined properties with the default values.
 */

var mk_proc = function(proc_spec) {
  var prop
    , new_proc= {}
    , template= { rA:  [1,0,0,0,0,0]
                , rI1: [1,0,0,0,0,0]
                , rI2: [1,0,0,0,0,0]
                , rI3: [1,0,0,0,0,0]
                , rI4: [1,0,0,0,0,0]
                , rI5: [1,0,0,0,0,0]
                , rI6: [1,0,0,0,0,0]
                , rX:  [1,0,0,0,0,0]
                , rJ:  [1,0,0,0,0,0]
                , compi: 0
                , ovtog: false
                , inst_pointer: 0
                , u_elapsed: 0
                }
  for (prop in template) {
    // deviations from the default will be truthy
    if (proc_spec && proc_spec[prop]) new_proc[prop]= proc_spec[prop]
    else new_proc[prop]= template[prop] }
  return new_proc
}

/**
 * TODO
 * the inst object can be augmented with a prototype that is the whole guts
 * object. Or somehow have access to all of them.
 *
 * Ideally, inst.exec() should execute the proper guts function for this
 * inst. In fact, it should probably contain the routing table for safety
 * purposes.
 *
 * Mk_inst.prototype should have:
 * a link to guts
 * the routing table
 * possibly other util functions.
 */

var Mk_inst = function (word) {
  this.address = word[0] * (64*word[1] + word[2])
  this.index = word[3]
  this.field = word[4]
  this.opcode = word[5]
}

Mk_inst.prototype =
  { reg: function () {
      var reg_key= [ 'rA', 'rI1', 'rI2', 'rI3', 'rI4', 'rI5', 'rI6', 'rX' ]
      switch (this.opcode) { // exceptions for STJ and STZ
        case 32: return 'rJ'
        case 33: return 'ZERO' }
      return reg_key[this.opcode %8] }
  , get_M: function () {
      return this.address +
            (this.index && util.word2num(this.proc['rI'+this.index])) }
  , get_V: function () {
      var mem_word= this.mem[this.get_M()] || [1,0,0,0,0,0]
      return util.extract_field(mem_word, this.field) }
  }

var Mk_mix = function (mix_spec) {
  this.proc = mk_proc(mix_spec && mix_spec['proc_spec'])
  this.mem = mk_mem(mix_spec && mix_spec['mem_spec'])
  this.devices = []
  this.not_halted = true
}

Mk_mix.prototype =
  { fetch: function () {
      var word= this.mem[this.proc.inst_pointer] || [1,0,0,0,0,0]
      this.proc.inst_pointer += 1
      return new Mk_inst(word) } // TODO cache decoded instructions
  , decode: function (inst) {
      var row= Math.floor(inst.opcode /8)
      inst_augmentation_table[row](inst)
      inst.proc = this.proc
      inst.mem = this.mem
      inst.devices= this.devices }
  , execute: function (inst) {
      inst.exec(inst) }
  , cycle: function () {
      var inst= this.fetch()
      this.decode(inst)
      this.execute(inst) }
  , reset: function () {
      this.proc = mk_proc()
      this.mem = [] }
  }
