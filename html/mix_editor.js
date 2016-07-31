var editor = document.getElementById('asm_src')

var surround = function (before, after) {
  var text= editor.value
    , sel_start= editor.selectionStart
    , sel_end= editor.selectionEnd

  editor.value = [ text.slice(0,sel_start)
                 , before
                 , text.substring(sel_start, sel_end)
                 , after
                 , text.slice(sel_end)
                 ].join('')

  editor.selectionStart = sel_start + before.length
  editor.selectionEnd = sel_end + before.length
  editor.focus()
}
/**
 * NOTES:
 *
 * if you 'return false' from an event handler, the default action is
 * prevented
 *
 * event.target is the element where the event actually occured
 *
 * var evt= document.createEvent('Mouse')
 * evt.initMouseEvent(...)
 * element.dispatchEvent(evt)
 *
 *
 * first: find the line in which selection starts
 * then: from there, find the line where the selection ends
 * then: join them into a buffer and perform the edit
 * finally: split the lines back up and reinsert them into the line array
 *
 * note: cache the line last edited so that just typing in a line doesn't
 * have O(n) cost per input
 *
 */
