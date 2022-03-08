interface TimeSuggestion {
  natural: string
  precise?: string
  date: Date
}

// Takes an input string and outputs possible dates and times in the future that you might be referring to.
// I'm lazy, so to avoid building a full grammar I assume that the input will contain one alphabetic "word",
// and 0 or more digits.
//
// When those digits have suffixes (2nd, 8pm) we use them as the correct type, but otherwise we'll use the
// digits fuzzily, wherever they might make sense.
//
// I'm relying a lot on Sugar's Date.create, which handles a lot of formats but doesn't do well with
// incomplete strings.
export default class TimeParser {
  suggest (input: string): TimeSuggestion[] {
    let res = [] as TimeSuggestion[]
    let time: string // string that we're sure represent a time
    let dayOfMonth: number // string that we're sure is a day of the month
    let digits = [] as number[] // holds ambigious digits
    let now = new Date()

    input = input.trim().toLowerCase()

    // Find and remove digits from the string, leaving just the "word" (or nothing)
    let word = input.replace(/(\d+)([:.]\d*)?\s*(am?|pm?|st|nd|rd|th)?/g, (_, num, min = '', suffix) => {
      if (min || suffix?.match(/^a|p/)) {
        if (min) { // clean up minutes, and fill with empty zeros to make it always valid
          min = min.replace('.', ':')
          min = min + '0'.repeat(3 - min.length) // add 0s for missing digits
        }
        // just assume pm we know it's a time, but this isn't specified.
        let period = suffix?.startsWith('a') ? 'am' : 'pm'
        time = `${num}${min} ${period}`
      } else if (!suffix) {
        digits.push(parseInt(num))
      } else {
        dayOfMonth = parseInt(num)
      }
      return ''
    }).trim()

    // ignore when someone takes the extra effort to type "at"
    word = word.replace(/\s+at?/, '')

    // // Nothing at all. Just show some ideas
    // if (word.length == 0 && !time && !digits[0]) {
    //   res.push({natural: 'tomorrow', date: Date.create('tomorrow 8am')})
    //   if (now.getHours() < 18) {
    //     res.push({natural: 'tonight', date: Date.create('today 6pm')})
    //   }
    //   res.push({natural: 'next week', date: Date.create('next monday 8am')})
    // }

    // If there's a digit, but no other info
    if (word.length == 0 && digits[0] && !time) {
      res.push({natural: `for ${digits[0]} hour${digits[0] != 1 ? 's' : ''}`, date: Date.create(`in ${digits[0]} hours`)})
      res.push({natural: `for ${digits[0]} day${digits[0] != 1 ? 's' : ''}`, date: Date.create(`in ${digits[0]} days`)})
    }

    // A time (or number) without any other info
    if (word.length == 0 && (time || (digits[0] && digits[0] < 24))) {
      let t = time || this.guessTime(digits[0])
      let date = Date.create(t)
      if (date.isPast()) date.addHours(24)
      res.push({natural: `${date.isToday() ? 'today' : 'tomorrow'}, ${this.printConciseTime(date)}`, date})
    }

    // Format: # interval
    let intervals = 'minutes hours days weeks months years'.split(' ')
      .filter(i => digits.length > 0 && word.length && i.startsWith(word))
    for (let i of intervals) {
      let date = Date.create(`in ${digits[0]} ${i}`)
      if (digits[0] == 1) i = i.replace(/s$/, '') // singularize
      res.push({natural: `for ${digits[0]} ${i}`, date})
    }

    // Format: (next) day of week
    let hasNext = !!word.match(/\bnext\b/)
    let withoutNext = word.replace(/\s*next\s*/, '')
    let days = 'monday tuesday wednesday thursday friday saturday sunday'.split(' ')
      .filter(d => withoutNext.length && d.startsWith(withoutNext))
    for (let d of days) {
      let t = time || this.guessTime(digits[0])
      let date = Date.create(`${hasNext ? 'next ' : ''} ${d} ${t}`)
      if (date.isPast() && date.isToday()) date.addDays(7)
      res.push({natural: `${hasNext ? 'next' : 'on'} ${date.format('{Weekday} at {h} {tt}')}`, date})
    }

    // Format: March 3 or 3 March
    let months = 'january february march april may june july august september october november december'.split(' ')
      .filter(m => word.length && m.startsWith(word))
    for (let m of months) {
      let t = time || this.guessTime(digits[1])
      let date = Date.create(`${m} ${dayOfMonth || digits[0] || '1'} ${t}`)
      let naturalTime = (time || digits[1]) && ` at ${this.printConciseTime(date)}`
      res.push({natural: `${date.format('{Month} {do}')}${naturalTime || ''}`, date})
    }

    // Format #-#

    if (word.length && ('today'.startsWith(word) || 'tdy'.startsWith(word))) {
      let t = time || this.guessTime(digits[0])
      let date = Date.create(`today ${t}`)
      if (date.isFuture()) {
        res.push({natural: `today at ${this.printConciseTime(date)}`, date})
      } else if (date.isPast() && date.getHours() < 12 && !time) {
        date.addHours(12)
        res.push({natural: `today at ${this.printConciseTime(date)}`, date})
      }
    }

    if ('tomorrow'.startsWith(word) || 'tmrw'.startsWith(word)) {
      let t = time || this.guessTime(digits[0])
      let date = Date.create(`tomorrow ${t}`)
      res.push({natural: `tomorrow at ${this.printConciseTime(date)}`, date})
    }

    if (word.length && ('tonight'.startsWith(word) || 'tnight'.startsWith(word))) {
      let t = time || (digits[0] ? this.guessTime(digits[0]) : '6 pm')
      let date = Date.create(`today ${t}`)
      res.push({natural: `tonight at ${this.printConciseTime(date)}`, date})
    }

    for (let ts of res) {
      ts.precise = this.printPrecise(ts.date)
    }

    return res
  }

  printConciseTime (d: Date) {
    return d.format(d.getMinutes() ? '{h}:{mm} {tt}' : '{h} {tt}')
  }

  printPrecise (d: Date): string {
    let t = d.getMinutes() ? '{h}:{mm} {tt}' : '{h} {tt}'
    return d.format(`{Dow}, {Mon} {d} at ${t}`)
  }

  guessTime (num: number): string {
    if (!num) return '8 am'
    if (num > 12) return `${num - 12} pm`
    if (num < 8) return `${num} pm`
    else return `${num} am`
  }
}
