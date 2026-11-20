# Evacuation, explained simply: from the researcher's checklist to our model

**An evacuation is more than finding a road out.** People need to be able to
leave, make the journey, and reach a place that can receive and protect them.
Getting out of one dangerous place does not, by itself, mean reaching safety.

Imagine helping a whole neighbourhood move away from danger. Before drawing
arrows on a map, we need to ask: **Who needs help? Who is involved? How can
people travel? What could stop or harm them? Is the movement agreed and freely
chosen? What is waiting at the other end?**

Those are the six parts of the PhD evacuation researcher's presentation:
**Civilian Population, Actors, Transportation, Threats and Challenges,
Political, and Destination.** A "variable" is simply something we need to know
that can differ between situations, such as the number of people or how long
a crossing stays open. Many answers can change while an evacuation is under way.

**Where this explanation comes from.** The presentation checklist was supplied
by the project lead for this document. Its topics are preserved below, in
simpler language; the original slide file is not stored here. The summer-cohort
history and research relationship are also project-lead context. Descriptions
of the software come from this repository and its history, not new outside
research. The [detailed input reference][reference] provides the technical
definitions and further source links.

**The important distinction:** the presentation described information an AI tool
would need to help with civilian protection and evacuation during armed conflict.
It did not mean that our first model, or today's model, had that information or
could answer all those questions.

## 1. Where we began: Mariupol made some questions concrete

The researcher helped us start with Mariupol, studying official evacuations
under international humanitarian law: the laws intended to protect people
during war. Available open intelligence and data gave us something concrete
to work with, rather than an imaginary town and an average person.

The inherited project records included five population areas covering
**37,663 people**, with counts of children, older people, and disabled people.
There were also real building locations and **783 recorded damage points**.
Some details were estimated, including the breakdown of vulnerable people in
one area. These records were useful evidence, not a complete picture of
everyone's needs or circumstances.

The first version in this repository was much smaller than the researcher's
whole checklist. It pictured people moving towards **one simplified westbound
corridor**, with different walking speeds, delays before leaving, crowding,
danger, and an open-or-closed route.

That let us begin asking, "How might different people get out?" It did not
answer, "Have the parties agreed to their passage?" or "Can the destination
care for them?"

Sources: [starting population records][mariupol-population],
[data and estimation notes][data-notes], and the
[first version's description][first-version].

## 2. The original checklist, in everyday language

In the tables, **"not included" means the software does not answer the
question**. It does not mean the answer is no, the risk is absent, or the
question is unimportant. "Simplified" means we use an assumption to explore
the idea, not a measurement of what every real person would do.

### Civilian Population: Who needs to move, and what help do they need?

A count alone is not enough. The same number of people can have very different
needs.

| From the presentation | The simple question | Connection to our work today |
|---|---|---|
| Size | How many people need help leaving? | Mariupol has inherited population totals. The other cities' area totals are estimated. |
| Age and gender distribution | What is the age and gender mix? | We use broad age groups. Gender is not represented. |
| Number of families and household compositions | Who lives or travels together? | We make assumed families and groups, not a register of real households or their members. |
| Vulnerable populations: medical cases | Who needs treatment or medical support during the move? | Specific medical cases are not included. |
| Vulnerable populations: unaccompanied minors | Which children have no adult travelling with them? | Not included as a separate group. A general child count cannot answer this. |
| Vulnerable populations: elderly | Who may need more time or support? | Older people are represented with an assumed slower walking pace. Individual needs are not known. |
| Vulnerable populations: disabled | What access or assistance does each person need? | A broad group and assumed walking pace stand in for much more varied needs. Accessible journeys are not worked out. |
| Documentation status | Do people have the papers needed for passage or entry? | Not included. |

**The connection:** the presentation taught us not to treat everyone as the
same traveller. Mariupol supplied some population evidence; later work added
different kinds of travelling groups. Neither gives us a full picture of each
person. A family in the simulation is kept together as one unit; its members
are not separately found and reunited.

Sources: [Mariupol's population areas][mariupol-population],
[how travelling groups are represented][households], and
[population definitions and limits][population-reference].

### Actors: Who is involved?

"Actors" means the people and organisations whose actions matter, not
performers in a play.

| From the presentation | The simple question | Connection to our work today |
|---|---|---|
| Humanitarian | Who can help people, organise aid, or support passage? | Humanitarian organisations are not simulated as decision-makers. |
| Governments | Who makes public decisions and grants permissions? | Government decisions are not simulated. |
| Military | Who controls armed forces or access along the way? | Military actors, positions, and decisions are not simulated. |
| Civilians | What do the people leaving need, know, and choose? | This is the main focus: simulated people and groups follow simple rules about waiting, moving, and choosing routes. |

**The connection:** the presentation described an evacuation involving many
parties. Our model mostly explores the civilian side. More moving dots on the
screen do not mean we have also modelled negotiations or humanitarian
coordination. The current dots follow written rules, not live AI conversations.

Sources: [how the simulated travellers decide][decisions] and
[what the model still leaves out][gaps].

### Transportation: Can people actually make the journey?

A road on a map is not the same as a journey someone can complete.

| From the presentation | The simple question | Connection to our work today |
|---|---|---|
| Road/Corridor Status | Is the way open, blocked, or crowded? | We set routes open or closed and simulate crowds; we do not track real blockages. |
| Communication Reliability and Systems; Communications reliability | Can warnings and route news reach people reliably? Through what systems? | We simplify this into how informed people are and how long warnings take. We do not model phone, radio, or other communication networks. |
| Distance to destination and travel time | How far is the whole journey, and how long might it take? | We calculate travel along the modelled paths. These stop at chosen exits, not necessarily the final place of refuge. |
| Availability and means of transportation: truck, bus, foot, number of drivers | Can people walk, or are vehicles and drivers available? | People walk. New York also has simplified train and ferry exits, but there are no allocated trucks, buses, or drivers. |
| Fuel and maintenance | Can the vehicles keep running? | Not included. |
| Border opening duration | How long is a border crossing available? | Borders are not modelled. New York's transport-closing time explores a similar timing problem, but is not a border agreement. |

The presentation mentions communication reliability twice; both mentions are
combined above.

**The connection:** we moved from one simplified corridor to several routes
based on real roads. We also added the walk to a route and, in New York, the
problem of reaching a station after service has stopped. These additions help
us explore access and timing, not the full transport system.

Sources: [how routes and access paths are built][route-building],
[current transport limits][transport-reference], and
[New York's station and ferry exits][nyc-routes].

### Threats and Challenges: What could harm people or stop the move?

The answers can change while people are waiting or travelling. A morning
snapshot is not the whole evacuation.

| From the presentation | The simple question | Connection to our work today |
|---|---|---|
| Time pressure: imminent attack indicators and threats | How much time is left before danger arrives or gets worse? | We model delays and elapsed time, not an attack forecast or a verified deadline for safe departure. |
| Intensity of hostilities | How severe is the fighting? | One simplified danger setting affects movement and willingness to leave. It is not a detailed account of fighting. |
| Proximity of armed groups | How close are armed groups to people or their route? | Not included. |
| Risk of retaliation | Might people face harm because they leave or because of the route they take? | Not assessed. |
| Agreements timelines | When does an agreement start, and when does it expire? | Not included. A transport shutdown clock is not a ceasefire or passage agreement. |
| Checkpoint / Access Restrictions | Who can pass, and what might delay or prevent passage? | A route can close, but checkpoint permissions, checks, and restrictions are not individually represented. |
| Weather | Could rain, cold, heat, wind, or poor visibility change the journey? | Simplified weather choices affect walking, crowding, warnings, route information, and transport availability. |
| Access to food/water/medicine | Can people meet basic needs while waiting and travelling? | Supplies and their use over time are not included. |

**The connection:** Mariupol's damage records helped describe the setting.
But the damage dots shown on today's map do **not** make nearby routes more
dangerous in the calculation. The danger setting and weather effects are
separate, simplified assumptions. The software can change some conditions
during a run; it does not predict how a conflict will develop.

Sources: [weather effects][weather], [damage-data provenance][data-notes],
and [the repository's recorded limitations][backlog].

### Political: Is the movement agreed, permitted, and freely chosen?

This category is about permission, power, and people's choices. It is not an
optional extra that a good road map can replace.

| From the presentation | The simple question | Connection to our work today |
|---|---|---|
| Government consent | Have the relevant government authorities agreed? | Not included. |
| Armed group consent | Have the relevant armed groups agreed? | Not included. |
| Humanitarian access permissions and agreements | Are humanitarian organisations allowed to reach and help people? | Not included. |
| Ceasefire status | Is an agreed pause in fighting in place? | Not included. |
| Negotiation outcomes | What has actually been agreed, rather than merely discussed? | Not included. |
| Risks of manipulations, ethnic cleansing, forced transfer | Are people being misled, forced out, or targeted for removal because of who they are? | These risks are not assessed by the simulator. |
| Willingness of evacuees to evacuate | Do people want to leave, and can they choose freely? | Some simulated groups hesitate or refuse. That is a simple behaviour assumption, not a test of free consent. |

**The connection:** later work lets simulated people wait for information,
follow others, hesitate, or turn back. That helps us ask about delay. It does
not tell us why a real person stayed, prove that a move was voluntary, or
establish that an evacuation met the law's requirements.

Sources: [behaviour assumptions][behaviour-reference],
[protection and consent gaps][gaps], and
[the project's limits][scope].

### Destination: What happens when people arrive?

Leaving the danger area is one part of the story. Being received somewhere
that can support people is another.

| From the presentation | The simple question | Connection to our work today |
|---|---|---|
| Willingness | Is the receiving community willing to welcome people? | Not included. This is separate from evacuees' willingness to leave. |
| Capacity | How many people can the destination receive? | Not included. |
| Shelter availability | Is there somewhere for people to stay? | Shelter places and available spaces are not calculated. |
| Food and water capacity | Can the destination feed people and provide water? | Not included. |
| Medical capacity | Can it provide the treatment and support people need? | Not included. |
| Security | Will people be protected there? | Routes have a supplied safety label; the software does not investigate security at the destination. |
| Local authorities consent | Have the receiving authorities agreed to admit people? | Not included. |

Here, destination "willingness" is read as willingness to receive people.

**The connection:** the Mariupol model separates the eastward,
filtration-bound exit from exits labelled as reaching safety. That is an
important distinction, but it is still a supplied label, not a protection
assessment. A finished journey on screen does not prove that there are beds,
water, medical care, or permission to stay at the other end. The simulation
also does not follow the whole onward journey to Zaporizhzhia.

Sources: [Mariupol's exits and their labels][mariupol-routes],
[what completion means][outcomes], and
[the destination questions still missing][gaps].

## 3. How the newer work builds on the original understanding

The original questions did not disappear when we added other places.
The new settings let us challenge assumptions that one example might hide.

| Setting | The simple question it helps us explore | What not to conclude |
|---|---|---|
| Mariupol: the starting case | Can people with different needs leave, and is every exit really an exit towards protection? | An exit labelled safe is not proof of actual protection or lawful passage. |
| Lower Manhattan: storm-surge setting | What if water limits the ways out, or people reach a train or ferry after it has closed? | This is not a complete storm evacuation plan or a detailed transport timetable. |
| Las Vegas Strip: crowd setting | Are we describing local residents or the visitors actually present? | A real census of residents is not automatically a count of the crowd. The visitor alternative also contains assumptions. |
| Miami: hurricane setting | How do weather, delays, and several ways out interact? | A model where people walk does not tell us how a vehicle evacuation would perform. |

Sources: [the four case descriptions][cities], [the visitor assumptions][visitors],
and [the development history][history].

Across these settings, the newer work adds several useful questions:

- **Not just "how many people?", but "who travels together?"** A group can
  have a different pace and preparation time from someone alone. Those
  differences are assumed, not measured for every city.
- **Not just "where is the exit?", but "can I reach it, and will everyone
  choose it?"** Several routes let queues and crowd-following matter.
- **Not just "how far?", but "what happens before anyone starts?"** Warnings,
  checking information, and waiting can delay the start. Watching neighbours
  is represented simply; people do not actually exchange messages.
- **Not just "is it open now?", but "will it still be open when I arrive?"**
  Weather and a service-closing time can make a station unavailable.
- **Not just "how many got out?", but "who is still inside or turned back?"**
  Faster journeys among those who finished are not the whole outcome.

These are extensions to our understanding, **not proof that the assumptions
are correct**. The US examples are practice scenarios, not three additional
verified accounts of real evacuations. The [project backlog][backlog] records
the need to compare results with real evidence.

## 4. Put it together: one family's journey

Consider an **imaginary** family with an older member who needs medicine.
A short road is only one part of their problem. Have they heard a warning?
Are they together? Do they have their papers? Is transport available with a
driver and fuel? Is passage agreed? Do they want to go? Can the receiving
place offer shelter and care?

The newer model can explore a slower walking pace, a late warning, waiting,
a crowded route, rain, or a closed station. It cannot settle the questions
about papers, vehicles and fuel, agreements, free consent, or care on arrival.
Those are still part of the researcher's original evacuation framework,
even when they are not moving dots on our map.

**The takeaway:** the presentation gave us the bigger picture. Mariupol gave
us evidence with which to start. The newer work explores more of the journey
and exposes more assumptions, but it does not replace the people, agreements,
and receiving conditions needed for civilian protection.

This explainer is for understanding and research, **not real-world evacuation
instructions, a route-safety verdict, or a legal assessment**.

[reference]: EVACUATION_INPUT_REFERENCE.md
[first-version]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/blob/af56830/README.md
[mariupol-population]: ../data/cities/mariupol/zones.geojson
[data-notes]: ../data/README.md#captured-real-data-now-in-the-pack
[households]: AGENT_DECISIONS.md#2-the-decision-unit
[population-reference]: EVACUATION_INPUT_REFERENCE.md#4-who-is-exposed-population-and-vulnerability
[decisions]: AGENT_DECISIONS.md#1-what-offline-means-here
[gaps]: EVACUATION_INPUT_REFERENCE.md#12-what-still-prevents-a-full-evacuation-account
[route-building]: ../tools/fetch_city.py#L601-L716
[transport-reference]: EVACUATION_INPUT_REFERENCE.md#9-transit-and-assisted-transport
[nyc-routes]: ../data/cities/nyc/routes.geojson
[weather]: ../src/conditions.js
[backlog]: ../BACKLOG.md
[behaviour-reference]: EVACUATION_INPUT_REFERENCE.md#5-who-moves-together-and-how-they-behave
[scope]: METHOD.md#4-what-this-is-not
[mariupol-routes]: ../data/cities/mariupol/routes.geojson
[outcomes]: EVACUATION_INPUT_REFERENCE.md#11-state-and-outcomes-definitions-not-independent-inputs
[cities]: ../src/cities.js#L7-L33
[visitors]: ../src/mix.js#L107-L124
[history]: EVACUATION_INPUT_REFERENCE.md#1-how-the-input-set-developed
