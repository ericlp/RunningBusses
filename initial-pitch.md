I live in Gothenburg. Me and a few friends are running along the routes of city busses, numbered 22-99 in västtrafik göteborg. The distances vary quite a bit from 3 to 9 km per bus route.
Therefore we plan to sometimes run along several bus in a row, for example bus 59 4.5km and then bus 69 5km. The first ends close (200m) to where the second starts so it becomes a somewhat seamless course.
Västtrafik has a developer api, i am not sure what information is available.

I want a website that can help us plan this. Hopefully the website does not require a backend and i can just deploy it to a static web app. Cache all the necessary data, the bus routes dont change that much, maybe refresh one a month. Local storage or similar works fine. Maybe if you can export the current state and import to move between devices. 

The technical details are less important then the user interaction. I may have written most of the explanations of the UI from the perspective of a computer, but this will most likely be used primarily from phones. Maybe the planning will be done from a computer but not sure.

For visual style use something close to strava but use västtrafiks color palatte. This is all for personal use, dont worry about copyright or other things.

- I want the website to have a map of all the bus routes. 
- On the map, when I click on a bus route and it should stand out from all other routes on the map and display a popover with some information about the route; the bus number, the distance it travels, the start and end station etc. 
- On the map, I want to be have different viewing modes/filters for the routes, to show all routes, show all i have not completed, all i have not planned in a course, filter by total distance shorter or longer than etc.
- I want a "plan mode" on the map where i can created courses that are composed of a sequence of routes.
- When the plan mode is active i want a list of all courses in a vertical list to the left. At the top is a "Create Course" button. Below are all created courses, displaying the sequence of bus routes it is composed of, the total distance and the total start and end station. When i click on a course all routes in the course are highlighted on the map. Each course has an edit button. 
- When i click on the "Create Course" button i see a map which focuses on all routes currenlty not in a course.  I start by clicking on a bus route, and choosing which end of the route i start from. Then all routes that have an end station within 500m(customisable) of my end station are highlighted and i get to choose one. This continues until i feel finished. In the top of the screen on top of the map, is my start station and then in order from left to right, are small cards, each one representing one bus route i choose for this course, in each card is displayed the bus number, the end station and the distance. After the last card is a save button the the total distance.
- I want to be able to mark a course completed. All routes should derive its completed status from the course it is included in.
- Courses have the statuses NotCompleted, Completed
- Routes have the statuses NotPlanned, NotCompleted, Completed
- When i edit a course I should enter a similar view to when i created it. I shoud be able to split a course in two. I should be able to remove routes from the start and end of a course.

Stretch goals
- generate a .gpx file from a cource
