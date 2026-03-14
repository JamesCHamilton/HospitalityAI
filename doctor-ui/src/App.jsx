import DoctorQueue from "./DoctorQueue";

function App() {

  const doctors = [
    { id: 101, priority: 98 },
    { id: 102, priority: 94 },
    { id: 103, priority: 92 },
    { id: 104, priority: 90 },
    { id: 105, priority: 88 }
  ];
  

  return (
    <div>
      <h1>Doctor Priority Queue</h1>
      <DoctorQueue doctors={doctors}/>
    </div>
  );
}

export default App;