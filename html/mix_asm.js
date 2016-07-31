var Mk_asm_context = function () {
  this.loc_counter = 0
  this.symbol_table = {}
  this.future_refs = {}
  this.mem_ary = []
}

Mk_asm_context.prototype =
  { atomic_expr: function (str) {
      var exec_ary
      if ( str.charAt(0) === '*' ) {
        return { val: this.loc_counter
               , rest: str.substr(1) } }
      if ( exec_ary= /^[0-9]{1,10}(?![A-Z])/.exec(str) ) {
        return { val: +(exec_ary[0])
               , rest: str.substr(exec_ary[0].length) } }
      if ( exec_ary= /^(?=[0-9]{0,9}[A-Z])[A-Z0-9]{1,10}/.exec(str) ) {
        if ( exec_ary[0] in this.symbol_table  ) {
        return { val: this.symbol_table[exec_ary[0]]
               , rest: str.substr(exec_ary[0].length) } } }
      throw { name: "SyntaxError:AtomicExpression"
            , payload: { string: str }
            } }
  , eval_expr: function (str) {
      var exec_ary
        , atomic= this.atomic_expr( /^[+-]/.test(str) ? str.substr(1) : str )
        , val= ( str.charAt(0) === '-' ) ? -(atomic.val) : atomic.val
        , split_off_binary_op= /^(\/{1,2}|[-+*:])(.*)$/
      while ( exec_ary= split_off_binary_op.exec(atomic.rest) ) {
        if (!exec_ary) throw { name: "SyntaxError:Expression"
                             , payload: { string: str, rest: atomic.rest } }
        atomic= this.atomic_expr(exec_ary[2])
        switch (exec_ary[1]) {
          case '+' : val+= atomic.val                                ;break
          case '-' : val-= atomic.val                                ;break
          case '*' : val*= atomic.val                                ;break
          case '/' : val= Math.floor( val / atomic.val )             ;break
          case '//': val= Math.floor( (val * (1<<30)) / atomic.val ) ;break
          case ':' : val= (val *8) + atomic.val                      ;break }
      }
      return val }
  , W_val: function (str, as_num) {
      var i , len , exec_ary
        , ret_word= [1,0,0,0,0,0]
        , separated= str.split(',')
      for (i= 0, len= separated.length; i < len; i+= 1) {
        exec_ary= /^([^,(]+)?(?:\(([^)]+)\))?$/.exec(separated[i])
        if (!exec_ary) throw { name: "SyntaxError:W-Val"
                             , payload: { string: str } }
        util.insert_field_into( util.num2word(this.eval_expr(exec_ary[1]))
                              , ret_word
                              , exec_ary[2] ? this.eval_expr(exec_ary[2]) : 5
                              ) }
      return ( as_num ? util.word2num(ret_word) : ret_word ) }
  , ADDRESS: function (str) {
      var A_part
        , future_ref= /^(?=[0-9]{0,9}[A-Z])[A-Z0-9]{1,10}$/
        , literal_constant= /^=[^=]{1,9}=$/
        , splitter= /^([^,(]+)?(?:,([^(]+))?(?:\(([^)]+)\))?$/
        , exec_ary= splitter.exec(str)
      if (!exec_ary) throw { name: "SyntaxError:ADDRESS"
                           , payload: { string: str } }
      if (exec_ary[1]) {
        try { A_part= this.eval_expr(exec_ary[1]) }
        catch (err) {
          if ( future_ref.test(exec_ary[1]) ) A_part= exec_ary[1]
          else if ( literal_constant.test(exec_ary[1]) ) A_part= exec_ary[1]
          else throw { name: "SyntaxError:A-Part"
                     , payload: { string: exec_ary[1] } } } }
      else A_part= 0
      return { A_part: A_part // polymorphic: string if future ref, else num
             , index_part: exec_ary[2] ? this.eval_expr(exec_ary[2]) : 0
             , F_part: exec_ary[3] ? this.eval_expr(exec_ary[3]) : undefined
             } }
  , push_word: function (word) {
      this.mem_ary[this.loc_counter] = word
      this.loc_counter += 1 }
  , LOC: function (str, equiv) {
      var i , len , occurences , from_word
        , is_local= /^[0-9]H$/.test(str)
        , symbol_name= is_local ? str.charAt(0) + 'B' : str
        , future_ref_name= is_local ? str.charAt(0) + 'F' : str
      if ( !(symbol_name in this.symbol_table) || is_local ) {
        this.symbol_table[symbol_name] = equiv || this.loc_counter }
      else throw { name: "SyntaxError:SymbolAlreadyDefined"
                 , payload: { symbol: str } }
      if ( future_ref_name in this.future_refs ) {
        occurences= this.future_refs[future_ref_name].occurences
        from_word= util.num2word(this.symbol_table[symbol_name])
        for (i= 0, len= occurences.length; i < len; i+= 1) {
          util.insert_field_into( from_word
                                , this.mem_ary[occurences[i]]
                                , 2) }
        delete this.future_refs[future_ref_name] } }
  , register_future_ref: function (str) {
      var word
      if ( /^=[^=]{1,9}=/.test(str) ) word= this.W_val(str.slice(1,-1))
      if ( str in this.future_refs ) {
        this.future_refs[str].occurences.push(this.loc_counter) }
      else this.future_refs[str] = { occurences: [this.loc_counter]
                                   , word: word
                                   } }
  , postprocess: function (END_line_obj) {
      var i, len, prop , end_LOC , occurences , from_word
      if (END_line_obj.LOC) {
        end_LOC= this.future_refs[END_line_obj.LOC]
        delete this.future_refs[END_line_obj.LOC] }
      for ( prop in this.future_refs ) {
        from_word= util.num2word(this.loc_counter)
        occurences= this.future_refs[prop].occurences
        this.push_word(this.future_refs[prop].word || [1,0,0,0,0,0])
        for (i= 0, len= occurences.length; i < len; i+= 1) {
          util.insert_field_into( from_word
                                , this.mem_ary[occurences[i]]
                                , 2) } }
      if (END_line_obj.LOC) {
        occurences= end_LOC.occurences
        from_word= util.num2word(this.loc_counter)
        for (i= 0, len= occurences.length; i < len; i+= 1) {
          util.insert_field_into( from_word
                                , this.mem_ary[occurences[i]]
                                , 2) } }
      this.inst_pointer = util.word2num(this.W_val(END_line_obj.ADDRESS)) }
  , process_line: function (cur) {
      var word , decoded_OP , decoded_ADDRESS
      if (cur.OP === 'END') {
        this.postprocess(cur)
        return 'break' }
      if (cur.OP === 'EQU') {
        if (cur.LOC) this.LOC(cur.LOC, util.word2num(this.W_val(cur.ADDRESS)))
        return }
      if (cur.OP === 'ORIG') {
        if (cur.LOC) this.LOC(cur.LOC)
        this.loc_counter = this.W_val(cur.ADDRESS, 'as_num')
        return }
      if (cur.OP === 'CON') {
        if (cur.LOC) this.LOC(cur.LOC)
        this.push_word( this.W_val(cur.ADDRESS) )
        return }
      if (cur.OP === 'ALF') {
        if (cur.LOC) this.LOC(cur.LOC)
        word= cur.ADDRESS.split('').map(lookup_char_code)
        word.unshift(1) // sign
        this.push_word(word)
        return }
      word= []
      decoded_OP= OP_table.decode_OP(cur.OP)
      decoded_ADDRESS= this.ADDRESS(cur.ADDRESS)
      word[3]= decoded_ADDRESS.index_part
      if (decoded_ADDRESS.F_part) {
        if (decoded_OP.field_immutable) {
          throw { name: "SyntaxError:ImmutableFieldOverride" } }
        else word[4]= decoded_ADDRESS.F_part }
      else word[4]= decoded_OP.default_field
      word[5]= decoded_OP.opcode
      if (cur.LOC) this.LOC(cur.LOC) // this has to be *right* here
      if ( typeof decoded_ADDRESS.A_part === 'number' ) {
        util.insert_field_into( util.num2word(decoded_ADDRESS.A_part)
                              , word
                              , 2) }
      else this.register_future_ref(decoded_ADDRESS.A_part)
      this.push_word(word)
    }
  }

var assemble_line_objs = function (line_obj_ary) {
  var i , len
    , context = new Mk_asm_context()
  for (i= 0, len= line_obj_ary.length; i < len; i+= 1) {
    if ( context.process_line(line_obj_ary[i]) ) break
  }
  return context
}


// could put this in the context's prototype
var OP_table =
  { no_op: { regex: /^NOP$/
           , decode: function (OP) {
               return { opcode: 0
                      , default_field: 0
                      , field_immutable: false } } }
  , math: { regex: /^(ADD|SUB|MUL|DIV)$/
          , decode: function (OP) {
            var opcode
            switch (OP) {
              case "ADD": opcode= 1 ;break
              case "SUB": opcode= 2 ;break
              case "MUL": opcode= 3 ;break
              case "DIV": opcode= 4 ;break }
            return { opcode: opcode
                   , default_field: 5
                   , field_immutable: false
                   } } }
  , special: { regex: /^(NUM|CHAR|HLT)$/
             , decode: function (OP) {
                 var field
                 switch (OP) {
                   case "NUM" : field= 0 ;break
                   case "CHAR": field= 1 ;break
                   case "HLT" : field= 2 ;break }
                 return { opcode: 5
                        , default_field: field
                        , field_immutable: true
                        } } }
  , shift: { regex: /^S[LR](A|AX|C)$/
           , decode: function (OP) {
               var shift_type
                 , left_or_right= ( OP.charAt(1) === 'L' ? 0 : 1 )
               switch ( OP.slice(2) ) {
                 case "A" : shift_type= 0 ;break
                 case "AX": shift_type= 2 ;break
                 case "C" : shift_type= 4 ;break }
               return { opcode: 6
                      , default_field: shift_type + left_or_right
                      , field_immutable: true
                      } } }
  , move: { regex: /^MOVE$/
          , decode: function (OP) {
              return { opcode: 7
                     , default_field: 1
                     , field_immutable: false
                     } } }
  , load: { regex: /^LD[A1-6X]N?$/
          , decode: function (OP) {
              var offset= OP_table.calc_offset(OP.charAt(2))
                , is_load_negative= (OP.charAt(3) === 'N')
              return { opcode: (is_load_negative ? 16 : 8) + offset
                     , default_field: 5
                     , field_immutable: false } } }
  , store: { regex: /^ST[A1-6XJZ]$/
           , decode: function (OP) {
              var offset= OP_table.calc_offset(OP.charAt(2))
              return { opcode: 24 + offset
                     , default_field: (OP.charAt(2) === 'J' ? 2 : 5)
                     , field_immutable: false } } }
  , io: { regex: /^(JBUS|IOC|IN|OUT|JRED)$/
        , decode: function (OP) {
           var opcode
           switch ( OP ) {
             case 'JBUS': opcode= 34 ;break
             case 'IOC' : opcode= 35 ;break
             case 'IN'  : opcode= 36 ;break
             case 'OUT' : opcode= 37 ;break
             case 'JRED': opcode= 38 ;break }
           return { opcode: opcode
                  , default_field: 0
                  , field_immutable: false } } }
  , jumps: { regex: /^J(MP|SJ|OV|NOV|L|E|G|GE|NE|LE)$/
           , decode: function (OP) {
              var field_mod
                , offset= OP_table.calc_offset(OP.charAt(1))
              switch ( OP ) {
                case 'JMP' : field_mod= 0 ;break
                case 'JSJ' : field_mod= 1 ;break
                case 'JOV' : field_mod= 2 ;break
                case 'JNOV': field_mod= 3 ;break
                case 'JL'  : field_mod= 4 ;break
                case 'JE'  : field_mod= 5 ;break
                case 'JG'  : field_mod= 6 ;break
                case 'JGE' : field_mod= 7 ;break
                case 'JNE' : field_mod= 8 ;break
                case 'JLE' : field_mod= 9 ;break }
              return { opcode: 39
                     , default_field: field_mod
                     , field_immutable: true } } }
  , reg_jump: { regex: /^J[A1-6X]N?[NZP]$/
              , decode: function (OP) {
                 var field_mod
                   , offset= OP_table.calc_offset(OP.charAt(1))
                 switch ( OP.charAt(OP.length-1) ) {
                   case 'N': field_mod= 0 ;break
                   case 'Z': field_mod= 1 ;break
                   case 'P': field_mod= 2 ;break }
                 return { opcode: 40 + offset
                        , default_field: field_mod + (OP.length === 3 ? 0 : 3)
                        , field_immutable: true } } }
  , address_transfer: { regex: /^(INC|DEC|ENT|ENN)[A1-6X]$/
                      , decode: function (OP) {
                          var field
                            , offset= OP_table.calc_offset(OP.charAt(3))
                          switch ( OP.slice(0,3) ) {
                            case "INC": field= 0 ;break
                            case "DEC": field= 1 ;break
                            case "ENT": field= 2 ;break
                            case "ENN": field= 3 ;break }
                          return { opcode: 48 + offset
                                 , default_field: field
                                 , field_immutable: true } } }
  , reg_cmp: { regex: /^CMP[A1-6X]$/
             , decode: function (OP) {
                var offset= OP_table.calc_offset(OP.charAt(3))
                return { opcode: 56 + offset
                       , default_field: 5
                       , field_immutable: false } } }
  }

OP_table.calc_offset = function (reg_char) {
  switch (reg_char) {
    case 'A': return 0
    case 'X': return 7
    case 'J': return 8
    case 'Z': return 9
    default: return (+reg_char) }
}

OP_table.decode_OP = function (str) {
  var key
  for ( key in OP_table ) {
    if ( this[key].regex.test(str) ) {
      return this[key].decode(str) } }
  throw { name: "SyntaxError:InvalidOP" }
}
